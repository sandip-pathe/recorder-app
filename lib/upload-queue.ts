// Upload queue manager with exponential backoff and retry logic
import { videoStorage } from './video-storage';
import { UploadQueueItem, VideoMetadata } from './types';

const QUEUE_STORE = 'upload-queue';
const MAX_RETRY_ATTEMPTS = 5;
const BASE_DELAY = 1000; // 1 second

class UploadQueue {
  private db: IDBDatabase | null = null;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  async initialize() {
    this.db = await this.openQueueDB();
    this.startProcessing();
  }

  private openQueueDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('upload-queue-db', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'videoId' });
          store.createIndex('nextRetry', 'nextRetry', { unique: false });
        }
      };
    });
  }

  async addToQueue(videoId: string): Promise<void> {
    if (!this.db) throw new Error('Queue not initialized');

    const queueItem: UploadQueueItem = {
      videoId,
      attempts: 0,
      lastAttempt: null,
      nextRetry: new Date(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.put(queueItem);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`Video ${videoId} added to upload queue`);
        resolve();
      };
    });
  }

  async removeFromQueue(videoId: string): Promise<void> {
    if (!this.db) throw new Error('Queue not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getQueueItem(videoId: string): Promise<UploadQueueItem | null> {
    if (!this.db) throw new Error('Queue not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllQueueItems(): Promise<UploadQueueItem[]> {
    if (!this.db) throw new Error('Queue not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readonly');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async updateQueueItem(item: UploadQueueItem): Promise<void> {
    if (!this.db) throw new Error('Queue not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([QUEUE_STORE], 'readwrite');
      const store = transaction.objectStore(QUEUE_STORE);
      const request = store.put(item);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private calculateBackoff(attempts: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return BASE_DELAY * Math.pow(2, attempts);
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      const queueItems = await this.getAllQueueItems();
      const now = new Date();

      for (const item of queueItems) {
        // Check if it's time to retry
        if (item.nextRetry && new Date(item.nextRetry) > now) {
          continue;
        }

        // Check max attempts
        if (item.attempts >= MAX_RETRY_ATTEMPTS) {
          // Mark as permanently failed
          const metadata = await videoStorage.getMetadata(item.videoId);
          if (metadata) {
            metadata.status = 'failed';
            metadata.error = 'Max retry attempts reached';
            await videoStorage.saveMetadata(metadata);
          }
          await this.removeFromQueue(item.videoId);
          continue;
        }

        // Attempt upload
        await this.attemptUpload(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async attemptUpload(item: UploadQueueItem): Promise<void> {
    const metadata = await videoStorage.getMetadata(item.videoId);
    if (!metadata) {
      await this.removeFromQueue(item.videoId);
      return;
    }

    // Update metadata to uploading
    metadata.status = 'uploading';
    metadata.uploadAttempts = (metadata.uploadAttempts || 0) + 1;
    metadata.lastUploadAttempt = new Date();
    await videoStorage.saveMetadata(metadata);

    // Get video blob
    const videoBlob = await videoStorage.getVideo(item.videoId);
    if (!videoBlob) {
      metadata.status = 'failed';
      metadata.error = 'Video file not found';
      await videoStorage.saveMetadata(metadata);
      await this.removeFromQueue(item.videoId);
      return;
    }

    try {
      // Mock upload (simulate API call)
      const success = await this.mockUpload(videoBlob, metadata);

      if (success) {
        // Upload successful - update metadata and remove from queue
        // NOTE: We keep the video in local storage to demonstrate persistence
        // In production, you might want to delete after upload, but for this spike
        // we want to prove videos are safely stored locally
        metadata.status = 'completed';
        delete metadata.error;
        await videoStorage.saveMetadata(metadata);
        await this.removeFromQueue(item.videoId);
        
        console.log(`Upload successful for ${item.videoId}, video remains in local storage`);
        // Video intentionally NOT deleted - proving local persistence works
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      // Upload failed - update queue item with backoff
      item.attempts++;
      item.lastAttempt = new Date();
      item.nextRetry = new Date(Date.now() + this.calculateBackoff(item.attempts));
      item.error = error instanceof Error ? error.message : 'Unknown error';
      await this.updateQueueItem(item);

      // Update metadata
      metadata.status = 'pending';
      metadata.error = item.error;
      await videoStorage.saveMetadata(metadata);

      console.log(`Upload failed for ${item.videoId}, retry in ${this.calculateBackoff(item.attempts)}ms`);
    }
  }

  private async mockUpload(blob: Blob, metadata: VideoMetadata): Promise<boolean> {
    // Simulate network delay (1-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Simulate success/failure (50% success rate for better testing)
    // This demonstrates that videos persist locally even when uploads fail
    const success = Math.random() > 0.5;

    if (success) {
      console.log(`✅ Mock upload successful: ${metadata.filename} (${blob.size} bytes)`);
      console.log(`   Video remains in local storage (OPFS) for offline access`);
    } else {
      console.log(`❌ Mock upload failed: ${metadata.filename}`);
      console.log(`   Video safely stored locally, will retry automatically`);
    }

    return success;
  }

  async retryVideo(videoId: string): Promise<void> {
    const item = await this.getQueueItem(videoId);
    
    if (item) {
      // Reset attempts and schedule immediate retry
      item.attempts = 0;
      item.nextRetry = new Date();
      await this.updateQueueItem(item);
    } else {
      // Add to queue if not present
      await this.addToQueue(videoId);
    }

    // Trigger immediate processing
    await this.processQueue();
  }

  async retryAllFailed(): Promise<void> {
    const allMetadata = await videoStorage.getAllMetadata();
    const failed = allMetadata.filter(m => m.status === 'failed' || m.status === 'pending');

    for (const metadata of failed) {
      await this.retryVideo(metadata.id);
    }
  }

  startProcessing(): void {
    // Process queue every 5 seconds
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(console.error);
    }, 5000);

    // Initial processing
    this.processQueue().catch(console.error);
  }

  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

export const uploadQueue = new UploadQueue();

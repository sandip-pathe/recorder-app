// OPFS/IndexedDB wrapper for video storage
import { VideoMetadata } from './types';

const DB_NAME = 'video-recorder-db';
const DB_VERSION = 1;
const METADATA_STORE = 'video-metadata';
const VIDEO_STORE = 'video-data';

class VideoStorage {
  private db: IDBDatabase | null = null;
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private supportsOPFS: boolean = false;

  async initialize() {
    // Check OPFS support
    this.supportsOPFS = 'storage' in navigator && 'getDirectory' in (navigator.storage as any);
    
    // Initialize OPFS if supported
    if (this.supportsOPFS) {
      try {
        this.opfsRoot = await (navigator.storage as any).getDirectory();
        console.log('OPFS initialized successfully');
      } catch (error) {
        console.error('OPFS initialization failed:', error);
        this.supportsOPFS = false;
      }
    }

    // Always initialize IndexedDB (metadata + fallback storage)
    this.db = await this.initIndexedDB();
    
    // Request persistent storage
    if ('persist' in navigator.storage) {
      const isPersistent = await navigator.storage.persist();
      console.log(`Persistent storage: ${isPersistent ? 'granted' : 'denied'}`);
    }
  }

  private initIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
          metadataStore.createIndex('status', 'status', { unique: false });
          metadataStore.createIndex('date', 'date', { unique: false });
        }

        // Video data store (fallback for non-OPFS browsers)
        if (!db.objectStoreNames.contains(VIDEO_STORE)) {
          db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  async saveVideo(videoId: string, blob: Blob, metadata: VideoMetadata): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');

    // Save metadata to IndexedDB
    await this.saveMetadata(metadata);

    // Save video data to OPFS or IndexedDB
    if (this.supportsOPFS && this.opfsRoot) {
      await this.saveToOPFS(videoId, blob);
    } else {
      await this.saveToIndexedDB(videoId, blob);
    }
  }

  async saveVideoChunk(videoId: string, chunk: Blob, isFirstChunk: boolean = false): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');

    if (this.supportsOPFS && this.opfsRoot) {
      await this.appendToOPFS(videoId, chunk, isFirstChunk);
    } else {
      // For IndexedDB fallback, accumulate chunks in memory and save at the end
      // This is a simplified approach; a production app might use a more sophisticated method
      await this.appendToIndexedDB(videoId, chunk, isFirstChunk);
    }
  }

  private async saveToOPFS(videoId: string, blob: Blob): Promise<void> {
    if (!this.opfsRoot) throw new Error('OPFS not available');

    const fileHandle = await this.opfsRoot.getFileHandle(`${videoId}.webm`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  private async appendToOPFS(videoId: string, chunk: Blob, isFirstChunk: boolean): Promise<void> {
    if (!this.opfsRoot) throw new Error('OPFS not available');

    const fileHandle = await this.opfsRoot.getFileHandle(`${videoId}.webm`, { create: true });
    
    if (isFirstChunk) {
      // Start fresh
      const writable = await fileHandle.createWritable();
      await writable.write(chunk);
      await writable.close();
    } else {
      // Append to existing file
      const file = await fileHandle.getFile();
      const writable = await fileHandle.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.write(chunk);
      await writable.close();
    }
  }

  private saveToIndexedDB(videoId: string, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VIDEO_STORE], 'readwrite');
      const store = transaction.objectStore(VIDEO_STORE);
      const request = store.put({ id: videoId, data: blob });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async appendToIndexedDB(videoId: string, chunk: Blob, isFirstChunk: boolean): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const transaction = this.db!.transaction([VIDEO_STORE], 'readwrite');
      const store = transaction.objectStore(VIDEO_STORE);
      
      if (isFirstChunk) {
        const request = store.put({ id: videoId, data: chunk });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } else {
        // Get existing data and append
        const getRequest = store.get(videoId);
        getRequest.onsuccess = async () => {
          const existing = getRequest.result;
          if (existing) {
            const combined = new Blob([existing.data, chunk], { type: chunk.type });
            const putRequest = store.put({ id: videoId, data: combined });
            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => resolve();
          } else {
            const putRequest = store.put({ id: videoId, data: chunk });
            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => resolve();
          }
        };
        getRequest.onerror = () => reject(getRequest.error);
      }
    });
  }

  async getVideo(videoId: string): Promise<Blob | null> {
    if (!this.db) throw new Error('Storage not initialized');

    if (this.supportsOPFS && this.opfsRoot) {
      return await this.getFromOPFS(videoId);
    } else {
      return await this.getFromIndexedDB(videoId);
    }
  }

  private async getFromOPFS(videoId: string): Promise<Blob | null> {
    if (!this.opfsRoot) return null;

    try {
      const fileHandle = await this.opfsRoot.getFileHandle(`${videoId}.webm`);
      const file = await fileHandle.getFile();
      return file;
    } catch {
      return null;
    }
  }

  private getFromIndexedDB(videoId: string): Promise<Blob | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VIDEO_STORE], 'readonly');
      const store = transaction.objectStore(VIDEO_STORE);
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
    });
  }

  async deleteVideo(videoId: string): Promise<void> {
    if (!this.db) throw new Error('Storage not initialized');

    // Delete from OPFS or IndexedDB
    if (this.supportsOPFS && this.opfsRoot) {
      await this.deleteFromOPFS(videoId);
    } else {
      await this.deleteFromIndexedDB(videoId);
    }

    // Delete metadata
    await this.deleteMetadata(videoId);
  }

  private async deleteFromOPFS(videoId: string): Promise<void> {
    if (!this.opfsRoot) return;

    try {
      await this.opfsRoot.removeEntry(`${videoId}.webm`);
    } catch (error) {
      console.error('Failed to delete from OPFS:', error);
    }
  }

  private deleteFromIndexedDB(videoId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VIDEO_STORE], 'readwrite');
      const store = transaction.objectStore(VIDEO_STORE);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveMetadata(metadata: VideoMetadata): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.put(metadata);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getMetadata(videoId: string): Promise<VideoMetadata | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllMetadata(): Promise<VideoMetadata[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteMetadata(videoId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getStorageQuota(): Promise<{ usage: number; quota: number; percentUsed: number }> {
    if ('estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
      
      return { usage, quota, percentUsed };
    }
    
    return { usage: 0, quota: 0, percentUsed: 0 };
  }
}

export const videoStorage = new VideoStorage();

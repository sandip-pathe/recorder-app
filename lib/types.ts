// Core types for video storage and upload queue

export interface VideoMetadata {
  id: string;
  filename: string;
  duration: number;
  size: number;
  date: Date;
  mimeType: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  uploadAttempts?: number;
  lastUploadAttempt?: Date;
  error?: string;
}

export interface UploadQueueItem {
  videoId: string;
  attempts: number;
  lastAttempt: Date | null;
  nextRetry: Date | null;
  error?: string;
}

export interface StorageQuota {
  usage: number;
  quota: number;
  percentUsed: number;
}

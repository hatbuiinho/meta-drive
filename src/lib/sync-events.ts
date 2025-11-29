import { EventEmitter } from 'events';

export const driveSyncEmitter = new EventEmitter();

// Progress event types
export interface SyncProgressEvent {
  type: 'page_loaded' | 'file_processed' | 'sync_complete' | 'sync_error';
  total: number;
  done: number;
  percent: number;
  message?: string;
  data?: unknown;
}

export interface SyncStats {
  totalFiles: number;
  processedFiles: number;
  totalPermissions: number;
  processedPermissions: number;
  errors: number;
  processingTime: number;
}

// Emit progress events
export const broadcastProgress = (event: SyncProgressEvent) => {
  driveSyncEmitter.emit('progress', event);
};

// Start sync event
export const broadcastSyncStart = () => {
  driveSyncEmitter.emit('sync_start');
};

// Complete sync event
export const broadcastSyncComplete = (stats: SyncStats) => {
  driveSyncEmitter.emit('sync_complete', stats);
};

// Error event
export const broadcastSyncError = (error: string) => {
  driveSyncEmitter.emit('sync_error', error);
};

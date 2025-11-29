import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import GoogleDriveSyncService from '$lib/google-drive-sync';
import { driveSyncEmitter, type SyncProgressEvent, type SyncStats } from '$lib/sync-events';

export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action');
  const folderId = url.searchParams.get('folderId') || undefined;

  if (action === 'start') {
    return handleStartSync(folderId);
  } else if (action === 'progress') {
    return handleProgressStream();
  }

  return json(
    { error: 'Invalid action. Use ?action=start or ?action=progress' },
    { status: 400 }
  );
};

/**
 * Start the sync process
 */
async function handleStartSync(folderId?: string) {
  try {
    console.log('🚀 Starting Google Drive sync...');

    // Start sync in background (don't await to allow SSE to work)
    const syncService = new GoogleDriveSyncService();
    
    // Start sync and return immediately
    syncService.startSync(folderId).catch(error => {
      console.error('Sync failed:', error);
    });

    return json({
      success: true,
      message: 'Sync started successfully',
      folderId: folderId || 'all',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error starting sync:', error);
    
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start sync',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Server-Sent Events endpoint for real-time progress updates
 */
function handleProgressStream() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      console.log('🔗 SSE client connected for progress updates');

      // Send initial connection message
      const connectMessage = `data: ${JSON.stringify({ 
        type: 'connected', 
        message: 'SSE connection established',
        timestamp: new Date().toISOString()
      })}\n\n`;
      controller.enqueue(encoder.encode(connectMessage));

      // Event handlers
      const progressHandler = (event: SyncProgressEvent) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(message));
        console.log('📡 Broadcasted progress:', event);
      };

      const syncStartHandler = () => {
        const message = `data: ${JSON.stringify({ 
          type: 'sync_start', 
          message: 'Sync process started',
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(encoder.encode(message));
        console.log('📡 Broadcasted sync start');
      };

      const syncCompleteHandler = (stats: SyncStats) => {
        const message = `data: ${JSON.stringify({ 
          type: 'sync_complete', 
          message: 'Sync process completed',
          stats,
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(encoder.encode(message));
        console.log('📡 Broadcasted sync complete:', stats);
      };

      const syncErrorHandler = (error: string) => {
        const message = `data: ${JSON.stringify({ 
          type: 'sync_error', 
          message: 'Sync process failed',
          error,
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(encoder.encode(message));
        console.log('📡 Broadcasted sync error:', error);
      };

      // Register event listeners
      driveSyncEmitter.on('progress', progressHandler);
      driveSyncEmitter.on('sync_start', syncStartHandler);
      driveSyncEmitter.on('sync_complete', syncCompleteHandler);
      driveSyncEmitter.on('sync_error', syncErrorHandler);

      // Send keepalive ping every 30 seconds
      const keepAliveInterval = setInterval(() => {
        const pingMessage = `data: ${JSON.stringify({ 
          type: 'ping', 
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(encoder.encode(pingMessage));
      }, 30000);

      // Cleanup function
      const cleanup = () => {
        console.log('🔗 SSE client disconnected');
        clearInterval(keepAliveInterval);
        driveSyncEmitter.off('progress', progressHandler);
        driveSyncEmitter.off('sync_start', syncStartHandler);
        driveSyncEmitter.off('sync_complete', syncCompleteHandler);
        driveSyncEmitter.off('sync_error', syncErrorHandler);
        controller.close();
      };

      // Handle client disconnect
      // Note: SvelteKit handles stream cleanup automatically
      return cleanup;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

# Google Drive Sync with Real-time Progress

This implementation provides a complete solution for synchronizing Google Drive metadata to PostgreSQL with real-time progress tracking using Server-Sent Events (SSE).

## 🚀 **Features**

### **Real-time Progress Tracking**
- ✅ **Server-Sent Events (SSE)**: Live updates during sync process
- ✅ **Multiple Sync Phases**: Counting, Loading, Processing, Permissions, Complete
- ✅ **Detailed Progress**: File counts, percentages, and status messages
- ✅ **Error Handling**: Graceful error recovery and user feedback

### **Advanced Google Drive Integration**
- ✅ **Pagination Support**: Handles large datasets with nextPageToken
- ✅ **Batch Processing**: Optimized performance for thousands of files
- ✅ **Smart Updates**: Only updates records when data actually changes
- ✅ **Permission Sync**: Retrieves and syncs file permissions

### **Production-Ready UI**
- ✅ **shadcn/ui Components**: Card, Button, Progress with proper styling
- ✅ **Responsive Design**: Works on desktop and mobile
- ✅ **Real-time Updates**: SSE integration with automatic reconnection
- ✅ **Professional UI**: Clean, intuitive interface with status indicators

## 📡 **API Endpoints**

### **1. Start Sync**
```
GET /api/drive/sync?action=start&folderId=optional_folder_id
```

**Response:**
```json
{
  "success": true,
  "message": "Sync started successfully",
  "folderId": "all",
  "timestamp": "2025-11-28T09:14:00.000Z"
}
```

### **2. Progress Stream (SSE)**
```
GET /api/drive/sync?action=progress
```

**Event Types:**
- `connected`: SSE connection established
- `sync_start`: Sync process has begun
- `page_loaded`: New page of files loaded from Google Drive
- `file_processed`: Individual file processed
- `sync_complete`: Sync finished with statistics
- `sync_error`: Error occurred during sync
- `ping`: Keep-alive ping

**Example Events:**
```json
// page_loaded event
{
  "type": "page_loaded",
  "total": 1200,
  "done": 540,
  "percent": 45,
  "message": "Loaded page with 100 files (540/1200)",
  "data": { "pageFiles": 100, "totalPages": 12 }
}

// file_processed event  
{
  "type": "file_processed",
  "total": 1200,
  "done": 541,
  "percent": 45.1,
  "message": "Processed file: Document.pdf",
  "data": { "fileId": "abc123", "fileName": "Document.pdf", "isFolder": false }
}

// sync_complete event
{
  "type": "sync_complete",
  "message": "Sync process completed",
  "stats": {
    "totalFiles": 1200,
    "processedFiles": 1200,
    "totalPermissions": 3500,
    "processedPermissions": 3500,
    "errors": 2,
    "processingTime": 145000
  },
  "timestamp": "2025-11-28T09:16:25.000Z"
}
```

## 🎛️ **UI Components**

### **Sync Page: `/dashboard/sync`**

**Features:**
- **Start/Stop Controls**: Begin or halt sync process
- **Real-time Progress Bar**: Visual progress with percentage
- **Phase Indicators**: Current sync phase with appropriate icons
- **Statistics Display**: Final stats after completion
- **Error Handling**: Clear error messages and retry options
- **System Status**: Connection status indicators

**User Flow:**
1. User clicks "Start Sync" button
2. Button becomes disabled, progress bar appears
3. SSE connection established automatically
4. Real-time updates appear as sync progresses
5. When complete, statistics are displayed
6. User can start a new sync if needed

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Svelte UI     │◄──►│  API Endpoints   │◄──►│  Google Drive   │
│                 │    │                  │    │      API        │
│ • Start/Stop    │    │ • Start Sync     │    │                 │
│ • Progress Bar  │    │ • SSE Progress   │    │ • Pagination    │
│ • Statistics    │    │ • Error Handling │    │ • Permissions   │
│ • Status Icons  │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   PostgreSQL     │
                       │                  │
                       │ • DriveFile      │
                       │ • DrivePerm.     │
                       │ • Upsert Logic   │
                       │ • Transactions   │
                       └──────────────────┘
```

## 📁 **File Structure**

```
src/
├── lib/
│   ├── sync-events.ts          # Event emitter for SSE
│   ├── google-drive-sync.ts    # Main sync service
│   └── prisma.ts              # Prisma client v7+
├── routes/
│   ├── api/
│   │   └── drive/
│   │       └── sync/
│   │           └── +server.ts  # Start & Progress endpoints
│   └── (dashboard)/
│       └── sync/
│           └── +page.svelte    # Real-time UI
└── meta-drive.json             # Service account credentials
```

## 🛠️ **Technical Implementation**

### **Event System**
```typescript
// Event emitter for real-time updates
import { driveSyncEmitter } from '$lib/sync-events';

// Broadcast progress updates
broadcastProgress({
  type: 'file_processed',
  total: 1000,
  done: 500,
  percent: 50,
  message: 'Processing file...'
});
```

### **SSE Implementation**
```typescript
// Server-side SSE endpoint
export function handleProgressStream() {
  const stream = new ReadableStream({
    start(controller) {
      // Register event listeners
      driveSyncEmitter.on('progress', (event) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(message));
      });
    }
  });
}
```

### **Pagination Logic**
```typescript
// Handle large datasets with nextPageToken
let pageToken: string | undefined;
do {
  const response = await drive.files.list({
    pageSize: 100,
    pageToken,
    fields: 'files(id, name, ...),nextPageToken'
  });
  
  const files = response.data.files || [];
  pageToken = response.data.nextPageToken || undefined;
  
  // Process files...
} while (pageToken);
```

## 📊 **Performance Optimizations**

### **Batch Processing**
- Files processed in batches of 10 for better performance
- Database transactions ensure consistency
- Progress updates after each batch

### **Memory Management**
- Pagination prevents loading all files at once
- Event cleanup on disconnect
- Efficient streaming with SSE

### **Error Recovery**
- Individual record failures don't stop entire sync
- Automatic SSE reconnection on connection loss
- Detailed error reporting and logging

## 🔧 **Usage Instructions**

### **1. Setup**
```bash
# Ensure meta-drive.json exists with service account credentials
# Database is connected and migrations are applied
# Dependencies are installed
```

### **2. Start Development Server**
```bash
npm run dev
```

### **3. Access Sync UI**
Navigate to: `http://localhost:5173/dashboard/sync`

### **4. Start Sync**
1. Click "Start Sync" button
2. Watch real-time progress updates
3. View statistics upon completion
4. Handle any errors that occur

### **5. Monitor Logs**
Check console for detailed logging:
```
🚀 Starting Google Drive sync...
📊 Total files to process: 1200
📄 Fetched page: 100 files (total so far: 100)
🔄 Processing 1200 files in 120 batches of 10
📡 Broadcasted progress: { type: 'page_loaded', ... }
✅ Completed batch 1/120 (10 files)
```

## 🎯 **Production Deployment**

### **Environment Variables**
```env
DATABASE_URL="postgresql://..."
# Service account in meta-drive.json
```

### **Required Dependencies**
- `@google-cloud/local-auth` or `googleapis`
- `@prisma/client` 
- `prisma`
- `lucide-svelte` (for icons)

### **Database Schema**
```sql
-- Generated by Prisma migrations
CREATE TABLE "DriveFile" (...);
CREATE TABLE "DrivePermission" (...);
```

This implementation is production-ready and provides a professional-grade solution for Google Drive metadata synchronization with excellent user experience through real-time progress tracking! 🎉

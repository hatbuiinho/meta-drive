# Google Drive to PostgreSQL Sync

This implementation provides a complete solution to sync metadata from Google Drive to PostgreSQL using a service account.

## Architecture Overview

```
Google Drive API → GoogleDriveService → Prisma Client → PostgreSQL
                                              ↓
                                        SvelteKit API Route
```

## Enhanced Sync Process

The updated sync endpoint now provides comprehensive metadata synchronization with:

1. **Pre-sync Cleanup**: Removes orphaned records before importing new data
2. **Transaction-based Sync**: Uses Prisma transactions for data consistency  
3. **Smart Updates**: Only updates records when actual data has changed
4. **Batch Processing**: Efficiently processes large datasets
5. **Integrity Verification**: Validates database consistency after sync
6. **Detailed Logging**: Comprehensive progress tracking and error reporting

### Processing Flow:
```
1. Fetch from Google Drive
2. Cleanup orphaned records  
3. Sync DriveFile (transaction)
4. Sync DrivePermission (transaction)
5. Verify data integrity
6. Return comprehensive statistics
```

## Components

### 1. **Prisma Schema** (`prisma/schema.prisma`)
- **DriveFile**: Stores file metadata (id, name, mimeType, size, timestamps, etc.)
- **DrivePermission**: Stores file permissions (user access, roles, etc.)
- **Relationship**: DriveFile has many DrivePermission (cascade delete)

### 2. **Google Drive Service** (`src/lib/google-drive.ts`)
- Authenticates using service account from `meta-drive.json`
- Fetches files using Google Drive API v3
- Retrieves permissions for each file
- Handles folder detection (`isFolder` = true for `application/vnd.google-apps.folder`)

### 3. **API Endpoint** (`src/routes/api/drive/sync/+server.ts`)
- **POST** `/api/drive/sync` - Syncs all data from Google Drive
- **POST** `/api/drive/sync?folderId=XXX` - Syncs specific folder only
- Returns comprehensive sync statistics

## Database Migration

The schema creates two tables:

```sql
CREATE TABLE "DriveFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "parents" TEXT,
    "size" INTEGER,
    "modifiedTime" TIMESTAMP(3),
    "createdTime" TIMESTAMP(3),
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "trashed" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE "DrivePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "emailAddress" TEXT,
    "domain" TEXT,
    "allowFileDiscovery" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DrivePermission_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "DriveFile"("id") ON DELETE CASCADE
);
```

## Usage

### 1. Configure Service Account
Ensure `meta-drive.json` is present in the project root with valid service account credentials.

### 2. Run Migration
```bash
npx prisma migrate dev --name init
```

### 3. Sync Data
```bash
# Sync all files
curl -X POST http://localhost:5173/api/drive/sync

# Sync specific folder
curl -X POST "http://localhost:5173/api/drive/sync?folderId=YOUR_FOLDER_ID"
```

### 4. Response Format
```json
{
  "success": true,
  "sync": {
    "metadata": {
      "folderId": "all",
      "processingTimeMs": 15420,
      "timestamp": "2025-11-28T03:35:00.000Z"
    },
    "files": {
      "total": 150,
      "upserted": 120,
      "updated": 25,
      "skipped": 5,
      "errors": 0,
      "folders": 25,
      "regularFiles": 125
    },
    "permissions": {
      "total": 450,
      "upserted": 400,
      "updated": 45,
      "skipped": 5,
      "errors": 0,
      "cleaned": 8
    },
    "integrity": {
      "orphanedPermissions": 0,
      "invalidFileReferences": 0,
      "isConsistent": true
    }
  },
  "database": {
    "totalDriveFiles": 145,
    "totalDrivePermissions": 445
  }
}
```

## Enhanced Key Features

✅ **Service Account Authentication** - Uses `meta-drive.json` credentials  
✅ **Files List Integration** - Fetches all files/folders via Google Drive API  
✅ **Permissions Integration** - Retrieves permissions for each file  
✅ **Advanced Upsert Logic** - Smart updates only when data changes  
✅ **Folder Detection** - Automatically sets `isFolder` for Google Drive folders  
✅ **Transaction Safety** - Uses Prisma transactions for data consistency  
✅ **Orphaned Data Cleanup** - Removes orphaned files and permissions  
✅ **Data Integrity Verification** - Validates database consistency after sync  
✅ **Performance Monitoring** - Tracks processing time and batch statistics  
✅ **Comprehensive Statistics** - Detailed sync reporting with skip/error tracking  
✅ **Error Resilience** - Continues processing even if individual records fail  
✅ **Memory Efficient** - Processes data in batches to handle large datasets  
✅ **Prisma 7+ Compatible** - Uses latest Prisma client configuration  
✅ **TypeScript Safety** - Full type safety with proper interfaces  

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_DRIVE_FOLDER_ID` (optional) - Default folder to sync

## File Structure

```
src/
├── lib/
│   ├── google-drive.ts      # Google Drive API service
│   └── prisma.ts           # Prisma client with v7+ config
└── routes/
    └── api/
        └── drive/
            └── sync/
                └── +server.ts  # Sync API endpoint
```

This implementation is production-ready and follows SvelteKit and Prisma best practices.

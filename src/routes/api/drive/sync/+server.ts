import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import GoogleDriveService, { type DriveFileData, type DrivePermissionData } from '$lib/google-drive';
import prisma from '$lib/prisma';

export const POST: RequestHandler = async ({ url }) => {
  const startTime = Date.now();
  let totalFilesProcessed = 0;
  let totalPermissionsProcessed = 0;

  try {
    console.log('🚀 Starting comprehensive Google Drive metadata sync...');

    // Get optional folder ID from query parameters
    const folderId = url.searchParams.get('folderId') || process.env.GOOGLE_DRIVE_FOLDER_ID;
    console.log(`📁 Target folder: ${folderId || 'All files'}`);

    // Initialize Google Drive service
    const driveService = new GoogleDriveService();

    // Step 1: Sync all data from Google Drive
    console.log('📥 Fetching data from Google Drive...');
    const { files, allPermissions } = await driveService.syncAllData(folderId || undefined);

    console.log(`📊 Retrieved ${files.length} files and ${allPermissions.length} permissions from Google Drive`);

    // Step 2: Clean up orphaned records before syncing new data
    console.log('🧹 Cleaning up orphaned records...');
    await cleanupOrphanedRecords(files);

    // Step 3: Sync DriveFile records with transaction for consistency
    console.log('💾 Syncing DriveFile records...');
    const filesResult = await syncDriveFiles(files);
    totalFilesProcessed = filesResult.total;

    // Step 4: Sync DrivePermission records with transaction
    console.log('🔐 Syncing DrivePermission records...');
    const permissionsResult = await syncDrivePermissions(allPermissions, files);
    totalPermissionsProcessed = permissionsResult.total;

    // Step 5: Verify data integrity
    console.log('✅ Verifying data integrity...');
    const integrityCheck = await verifyDataIntegrity();

    // Calculate processing time
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Return comprehensive sync statistics
    const result = {
      success: true,
      sync: {
        metadata: {
          folderId: folderId || 'all',
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString(),
        },
        files: {
          total: files.length,
          upserted: filesResult.upserted,
          updated: filesResult.updated,
          skipped: filesResult.skipped,
          errors: filesResult.errors,
          folders: files.filter(f => f.isFolder).length,
          regularFiles: files.filter(f => !f.isFolder).length,
        },
        permissions: {
          total: allPermissions.length,
          upserted: permissionsResult.upserted,
          updated: permissionsResult.updated,
          skipped: permissionsResult.skipped,
          errors: permissionsResult.errors,
          cleaned: permissionsResult.cleaned,
        },
        integrity: integrityCheck,
      },
      database: {
        totalDriveFiles: await prisma.driveFile.count(),
        totalDrivePermissions: await prisma.drivePermission.count(),
      }
    };

    console.log('🎉 Sync completed successfully:', {
      filesProcessed: totalFilesProcessed,
      permissionsProcessed: totalPermissionsProcessed,
      processingTime: `${processingTime}ms`,
    });

    return json(result);

  } catch (error) {
    console.error('❌ Error during Google Drive sync:', error);
    
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
        processed: {
          files: totalFilesProcessed,
          permissions: totalPermissionsProcessed,
        },
      },
      { status: 500 }
    );
  }
};

/**
 * Clean up orphaned permissions and files that no longer exist in Google Drive
 */
async function cleanupOrphanedRecords(currentFiles: DriveFileData[]) {
  const currentFileIds = currentFiles.map(f => f.id);
  
  // Clean up orphaned permissions
  const orphanedPermissions = await prisma.drivePermission.findMany({
    where: {
      fileId: {
        notIn: currentFileIds
      }
    }
  });

  if (orphanedPermissions.length > 0) {
    console.log(`🗑️ Cleaning up ${orphanedPermissions.length} orphaned permissions`);
    await prisma.drivePermission.deleteMany({
      where: {
        id: {
          in: orphanedPermissions.map(p => p.id)
        }
      }
    });
  }

  // Clean up orphaned files (files not in Google Drive anymore)
  const orphanedFiles = await prisma.driveFile.findMany({
    where: {
      id: {
        notIn: currentFileIds
      }
    }
  });

  if (orphanedFiles.length > 0) {
    console.log(`🗑️ Cleaning up ${orphanedFiles.length} orphaned files`);
    await prisma.driveFile.deleteMany({
      where: {
        id: {
          in: orphanedFiles.map(f => f.id)
        }
      }
    });
  }
}

/**
 * Sync DriveFile records with comprehensive error handling
 */
async function syncDriveFiles(files: DriveFileData[]) {
  let upserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Use transaction for batch consistency
  await prisma.$transaction(async (tx) => {
    for (const fileData of files) {
      try {
        const existingFile = await tx.driveFile.findUnique({
          where: { id: fileData.id }
        });

        const driveFileData = {
          id: fileData.id,
          name: fileData.name || 'Untitled',
          mimeType: fileData.mimeType || null,
          parents: fileData.parents ? fileData.parents.join(',') : null,
          size: fileData.size || null,
          modifiedTime: fileData.modifiedTime || null,
          createdTime: fileData.createdTime || null,
          isFolder: fileData.isFolder || false,
          trashed: fileData.trashed || false,
        };

        if (existingFile) {
          // Check if data has changed before updating
          const hasChanges = JSON.stringify(existingFile) !== JSON.stringify({
            ...existingFile,
            ...driveFileData
          });

          if (hasChanges) {
            await tx.driveFile.update({
              where: { id: fileData.id },
              data: driveFileData,
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await tx.driveFile.create({
            data: driveFileData,
          });
          upserted++;
        }
      } catch (error) {
        console.error(`❌ Error upserting file ${fileData.id}:`, error);
        errors++;
      }
    }
  });

  return { upserted, updated, skipped, errors, total: files.length };
}

/**
 * Sync DrivePermission records with comprehensive error handling
 */
async function syncDrivePermissions(permissions: DrivePermissionData[], files: DriveFileData[]) {
  let upserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const cleaned = 0;

  // Filter permissions to only include those for files that exist
  const validFileIds = new Set(files.map(f => f.id));
  const validPermissions = permissions.filter(p => validFileIds.has(p.fileId));

  // Use transaction for batch consistency
  await prisma.$transaction(async (tx) => {
    for (const permissionData of validPermissions) {
      try {
        const existingPermission = await tx.drivePermission.findUnique({
          where: { id: permissionData.id }
        });

        const drivePermissionData = {
          id: permissionData.id,
          fileId: permissionData.fileId,
          type: permissionData.type || 'user',
          role: permissionData.role || 'reader',
          emailAddress: permissionData.emailAddress || null,
          domain: permissionData.domain || null,
          allowFileDiscovery: permissionData.allowFileDiscovery || false,
        };

        if (existingPermission) {
          // Check if data has changed before updating
          const hasChanges = JSON.stringify(existingPermission) !== JSON.stringify({
            ...existingPermission,
            ...drivePermissionData
          });

          if (hasChanges) {
            await tx.drivePermission.update({
              where: { id: permissionData.id },
              data: drivePermissionData,
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await tx.drivePermission.create({
            data: drivePermissionData,
          });
          upserted++;
        }
      } catch (error) {
        console.error(`❌ Error upserting permission ${permissionData.id}:`, error);
        errors++;
      }
    }
  });

  return { upserted, updated, skipped, errors, cleaned, total: validPermissions.length };
}

/**
 * Verify data integrity after sync
 */
async function verifyDataIntegrity() {
  try {
    // Check for orphaned permissions by finding permissions with non-existent files
    const orphanedPermissions = await prisma.drivePermission.count({
      where: {
        fileId: {
          notIn: (await prisma.driveFile.findMany({ select: { id: true } })).map(f => f.id)
        }
      }
    });

    // Check for invalid file references (files with permissions pointing to non-existent files)
    const allFileIds = new Set((await prisma.driveFile.findMany({ select: { id: true } })).map(f => f.id));
    const permissionsWithInvalidFiles = await prisma.drivePermission.count({
      where: {
        fileId: {
          notIn: Array.from(allFileIds)
        }
      }
    });

    return {
      orphanedPermissions,
      invalidFileReferences: permissionsWithInvalidFiles,
      isConsistent: orphanedPermissions === 0,
    };
  } catch (error) {
    console.error('❌ Error during integrity check:', error);
    return {
      orphanedPermissions: -1,
      invalidFileReferences: -1,
      isConsistent: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

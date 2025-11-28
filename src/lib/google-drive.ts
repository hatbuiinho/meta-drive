import { google, drive_v3 } from 'googleapis';
import type { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface DriveFileData {
  id: string;
  name: string;
  mimeType: string | null;
  parents: string[] | null;
  size: number | null;
  createdTime: Date | null;
  modifiedTime: Date | null;
  trashed: boolean;
  isFolder: boolean;
}

export interface DrivePermissionData {
  id: string;
  fileId: string;
  type: string;
  role: string;
  emailAddress: string | null;
  domain: string | null;
  allowFileDiscovery: boolean;
}

class GoogleDriveService {
  private drive: drive_v3.Drive;
  private auth: JWT;

  constructor() {
    // Read service account credentials from JSON file
    const serviceAccountPath = join(process.cwd(), 'meta-drive.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    this.auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  /**
   * List all files and folders from Google Drive
   */
  async listAllFiles(folderId?: string): Promise<DriveFileData[]> {
    try {
      const query = folderId 
        ? `'${folderId}' in parents and trashed = false`
        : 'trashed = false';

      const response = await this.drive.files.list({
        q: query,
        pageSize: 1000, // Increase if you have many files
        fields: 'files(id, name, mimeType, parents, size, createdTime, modifiedTime, trashed)',
      });

      const files = response.data.files || [];
      
      return files.map(file => ({
        id: file.id!,
        name: file.name || '',
        mimeType: file.mimeType || null,
        parents: file.parents || null,
        size: file.size ? parseInt(file.size) : null,
        createdTime: file.createdTime ? new Date(file.createdTime) : null,
        modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
        trashed: file.trashed || false,
        isFolder: file.mimeType === 'application/vnd.google-apps.folder',
      }));
    } catch (error) {
      console.error('Error listing files from Google Drive:', error);
      throw new Error('Failed to fetch files from Google Drive');
    }
  }

  /**
   * Get permissions for a specific file
   */
  async getFilePermissions(fileId: string): Promise<DrivePermissionData[]> {
    try {
      const response = await this.drive.permissions.list({
        fileId: fileId,
        fields: 'permissions(id, type, role, emailAddress, domain, allowFileDiscovery)',
      });

      const permissions = response.data.permissions || [];
      
      return permissions.map(permission => ({
        id: permission.id!,
        fileId: fileId,
        type: permission.type || '',
        role: permission.role || '',
        emailAddress: permission.emailAddress || null,
        domain: permission.domain || null,
        allowFileDiscovery: permission.allowFileDiscovery || false,
      }));
    } catch (error) {
      console.error(`Error getting permissions for file ${fileId}:`, error);
      // Return empty array if permissions can't be fetched
      return [];
    }
  }

  /**
   * Sync all files and their permissions
   */
  async syncAllData(folderId?: string): Promise<{
    files: DriveFileData[];
    allPermissions: DrivePermissionData[];
  }> {
    console.log('Starting Google Drive sync...');
    
    // Get all files
    const files = await this.listAllFiles(folderId);
    console.log(`Found ${files.length} files/folders`);

    // Get permissions for all files
    const allPermissions: DrivePermissionData[] = [];
    
    for (const file of files) {
      try {
        const permissions = await this.getFilePermissions(file.id);
        allPermissions.push(...permissions);
        console.log(`Got ${permissions.length} permissions for file: ${file.name}`);
      } catch (error) {
        console.warn(`Failed to get permissions for file ${file.id}:`, error);
      }
    }

    console.log(`Total permissions found: ${allPermissions.length}`);
    
    return {
      files,
      allPermissions,
    };
  }
}

export default GoogleDriveService;

import { google, drive_v3 } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '$lib/prisma';
import { broadcastProgress, broadcastSyncComplete, broadcastSyncError } from '$lib/sync-events';

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

export interface SyncStats {
	totalFiles: number;
	processedFiles: number;
	totalPermissions: number;
	processedPermissions: number;
	errors: number;
	processingTime: number;
}

class GoogleDriveSyncService {
	private drive: drive_v3.Drive;
	private totalFiles = 0;
	private processedFiles = 0;
	private totalPermissions = 0;
	private processedPermissions = 0;
	private errors = 0;
	private startTime = 0;

	constructor() {
		const serviceAccountPath = join(process.cwd(), 'meta-drive.json');
		const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

		const auth = new google.auth.JWT({
			email: serviceAccount.client_email,
			key: serviceAccount.private_key,
			scopes: ['https://www.googleapis.com/auth/drive.readonly']
		});

		this.drive = google.drive({ version: 'v3', auth });
	}

	/**
	 * Start the complete sync process with pagination
	 */
	async startSync(folderId?: string): Promise<SyncStats> {
		this.startTime = Date.now();
		console.log('🚀 Starting comprehensive Google Drive sync with pagination...');

		try {
			// Step 1: Get total file count for progress tracking
			this.totalFiles = await this.getTotalFileCount(folderId);
			console.log(`📊 Total files to process: ${this.totalFiles}`);

			// Step 2: Fetch and process all files with pagination
			await this.syncDriveFilesWithPagination(folderId);

			// Step 3: Process permissions for all files
			await this.syncAllPermissions();

			// Step 4: Cleanup orphaned data
			await this.cleanupOrphanedData();

			// Step 5: Calculate final stats
			const stats = this.getSyncStats();

			console.log('✅ Sync completed successfully:', stats);
			broadcastSyncComplete(stats);

			return stats;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('❌ Sync failed:', errorMessage);
			broadcastSyncError(errorMessage);
			throw error;
		}
	}

	/**
	 * Get total file count for progress tracking
	 */
	private async getTotalFileCount(folderId?: string): Promise<number> {
		try {
			const query = folderId ? `'${folderId}' in parents and trashed = false` : 'trashed = false';

			// Use files.list with nextPageToken to count all files
			let totalCount = 0;
			let pageToken: string | undefined;

			do {
				const pageResponse = await this.drive.files.list({
					q: query,
					pageSize: 100,
					fields: 'files(id),nextPageToken',
					pageToken
				});

				const files = pageResponse.data.files || [];
				totalCount += files.length;
				pageToken = pageResponse.data.nextPageToken || undefined;

				// Broadcast progress for page loading
				broadcastProgress({
					type: 'page_loaded',
					total: totalCount,
					done: 0,
					percent: Math.min((totalCount / 1000) * 100, 5), // Rough estimate
					message: `Loaded page with ${files.length} files`
				});
			} while (pageToken);

			return totalCount;
		} catch (error) {
			console.error('Error counting files:', error);
			return 0;
		}
	}

	/**
	 * Sync files with pagination support
	 */
	private async syncDriveFilesWithPagination(folderId?: string): Promise<void> {
		const query = folderId ? `'${folderId}' in parents and trashed = false` : 'trashed = false';

		let pageToken: string | undefined;
		let allFiles: drive_v3.Schema$File[] = [];

		// Fetch all files with pagination
		do {
			const response = await this.drive.files.list({
				q: query,
				pageSize: 100,
				fields:
					'files(id, name, mimeType, parents, size, createdTime, modifiedTime, trashed),nextPageToken',
				pageToken
			});

			const files = response.data.files || [];
			allFiles = allFiles.concat(files);
			pageToken = response.data.nextPageToken || undefined;

			console.log(`📄 Fetched page: ${files.length} files (total so far: ${allFiles.length})`);

			// Broadcast page loaded event
			broadcastProgress({
				type: 'page_loaded',
				total: this.totalFiles,
				done: allFiles.length,
				percent: Math.min((allFiles.length / this.totalFiles) * 60, 60), // Files phase: 60%
				message: `Loaded page with ${files.length} files (${allFiles.length}/${this.totalFiles})`,
				data: { pageFiles: files.length, totalPages: Math.ceil(this.totalFiles / 100) }
			});
		} while (pageToken);

		console.log(`📁 Total files fetched: ${allFiles.length}`);

		// Convert to our format and process
		const driveFiles = allFiles.map((file) => ({
			id: file.id!,
			name: file.name || 'Untitled',
			mimeType: file.mimeType || null,
			parents: file.parents || null,
			size: file.size ? parseInt(file.size) : null,
			createdTime: file.createdTime ? new Date(file.createdTime) : null,
			modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
			trashed: file.trashed || false,
			isFolder: file.mimeType === 'application/vnd.google-apps.folder'
		}));

		// Process files in batches
		await this.processFilesBatch(driveFiles);
	}

	/**
	 * Process files in batches for better performance
	 */
	private async processFilesBatch(files: DriveFileData[]): Promise<void> {
		const batchSize = 10;
		const batches = [];

		for (let i = 0; i < files.length; i += batchSize) {
			batches.push(files.slice(i, i + batchSize));
		}

		console.log(`🔄 Processing ${files.length} files in ${batches.length} batches of ${batchSize}`);

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			const batch = batches[batchIndex];

			await prisma.$transaction(async (tx) => {
				for (const fileData of batch) {
					try {
						const existingFile = await tx.driveFile.findUnique({
							where: { id: fileData.id }
						});

						const driveFileData = {
							id: fileData.id,
							name: fileData.name,
							mimeType: fileData.mimeType,
							parents: fileData.parents ? fileData.parents.join(',') : null,
							size: fileData.size,
							modifiedTime: fileData.modifiedTime,
							createdTime: fileData.createdTime,
							isFolder: fileData.isFolder,
							trashed: fileData.trashed
						};

						if (existingFile) {
							// Check if update is needed
							const hasChanges =
								JSON.stringify(existingFile) !==
								JSON.stringify({
									...existingFile,
									...driveFileData
								});

							if (hasChanges) {
								await tx.driveFile.update({
									where: { id: fileData.id },
									data: driveFileData
								});
							}
						} else {
							await tx.driveFile.create({
								data: driveFileData
							});
						}

						this.processedFiles++;

						// Broadcast file processed event
						const filePercent = 60 + (this.processedFiles / this.totalFiles) * 35; // File phase: 35%
						broadcastProgress({
							type: 'file_processed',
							total: this.totalFiles,
							done: this.processedFiles,
							percent: Math.min(filePercent, 95),
							message: `Processed file: ${fileData.name}`,
							data: { fileId: fileData.id, fileName: fileData.name, isFolder: fileData.isFolder }
						});
					} catch (error) {
						console.error(`Error processing file ${fileData.id}:`, error);
						this.errors++;
					}
				}
			});

			console.log(`✅ Completed batch ${batchIndex + 1}/${batches.length} (${batch.length} files)`);
		}
	}

	/**
	 * Sync permissions for all files
	 */
	private async syncAllPermissions(): Promise<void> {
		console.log('🔐 Starting permissions sync...');

		// Get all files from database
		const allFiles = await prisma.driveFile.findMany({
			select: { id: true }
		});

		this.totalPermissions = 0; // We'll count as we go
		const processedPermissionIds = new Set<string>();

		for (let i = 0; i < allFiles.length; i++) {
			const file = allFiles[i];

			try {
				const response = await this.drive.permissions.list({
					fileId: file.id,
					fields: 'permissions(id, type, role, emailAddress, domain, allowFileDiscovery)'
				});

				const permissions = response.data.permissions || [];
				this.totalPermissions += permissions.length;

				await prisma.$transaction(async (tx) => {
					for (const permission of permissions) {
						if (processedPermissionIds.has(permission.id!)) {
							continue; // Skip duplicates
						}

						try {
							const drivePermissionData = {
								id: permission.id!,
								fileId: file.id,
								type: permission.type || 'user',
								role: permission.role || 'reader',
								emailAddress: permission.emailAddress || null,
								domain: permission.domain || null,
								allowFileDiscovery: permission.allowFileDiscovery || false
							};

							const existingPermission = await tx.drivePermission.findUnique({
								where: { id: permission.id! }
							});

							if (existingPermission) {
								const hasChanges =
									JSON.stringify(existingPermission) !==
									JSON.stringify({
										...existingPermission,
										...drivePermissionData
									});

								if (hasChanges) {
									await tx.drivePermission.update({
										where: { id: permission.id! },
										data: drivePermissionData
									});
								}
							} else {
								await tx.drivePermission.create({
									data: drivePermissionData
								});
							}

							processedPermissionIds.add(permission.id!);
							this.processedPermissions++;
						} catch (error) {
							console.error(`Error processing permission ${permission.id}:`, error);
							this.errors++;
						}
					}
				});

				// Broadcast permissions progress (Permissions phase: 5%)
				const permissionPercent = 95 + (i / allFiles.length) * 5;
				broadcastProgress({
					type: 'file_processed',
					total: allFiles.length,
					done: i + 1,
					percent: Math.min(permissionPercent, 100),
					message: `Processed permissions for file ${i + 1}/${allFiles.length}`,
					data: { fileId: file.id, permissionsCount: permissions.length }
				});
			} catch (error) {
				console.error(`Error getting permissions for file ${file.id}:`, error);
				this.errors++;
			}
		}

		console.log(
			`✅ Permissions sync completed: ${this.processedPermissions}/${this.totalPermissions}`
		);
	}

	/**
	 * Clean up orphaned data
	 */
	private async cleanupOrphanedData(): Promise<void> {
		console.log('🧹 Cleaning up orphaned data...');

		// Clean up orphaned permissions
		const allFileIds = (await prisma.driveFile.findMany({ select: { id: true } })).map((f) => f.id);

		const orphanedPermissions = await prisma.drivePermission.findMany({
			where: {
				fileId: {
					notIn: allFileIds
				}
			}
		});

		if (orphanedPermissions.length > 0) {
			console.log(`🗑️ Deleting ${orphanedPermissions.length} orphaned permissions`);
			await prisma.drivePermission.deleteMany({
				where: {
					id: {
						in: orphanedPermissions.map((p) => p.id)
					}
				}
			});
		}

		console.log('✅ Cleanup completed');
	}

	/**
	 * Get final sync statistics
	 */
	private getSyncStats(): SyncStats {
		const processingTime = Date.now() - this.startTime;

		return {
			totalFiles: this.totalFiles,
			processedFiles: this.processedFiles,
			totalPermissions: this.totalPermissions,
			processedPermissions: this.processedPermissions,
			errors: this.errors,
			processingTime
		};
	}
}

export default GoogleDriveSyncService;

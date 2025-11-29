<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import {
		FolderSync,
		Cloud,
		Check,
		X,
		Play,
		Square,
		Database,
		FileText,
		Shield
	} from '@lucide/svelte';

	// State variables
	let isSyncing = false;
	let progress = 0;
	let total = 0;
	let done = 0;
	let currentMessage = 'Ready to sync';
	let syncStats: any = null;
	let eventSource: EventSource | null = null;

	// Sync phases for UI feedback
	type SyncPhase =
		| 'idle'
		| 'counting'
		| 'loading'
		| 'processing'
		| 'permissions'
		| 'complete'
		| 'error';
	let currentPhase: SyncPhase = 'idle';

	$: phaseMessage = getPhaseMessage(currentPhase);
	$: phaseIcon = getPhaseIcon(currentPhase);

	function getPhaseMessage(phase: SyncPhase): string {
		switch (phase) {
			case 'idle':
				return 'Ready to sync Google Drive metadata';
			case 'counting':
				return 'Counting total files...';
			case 'loading':
				return 'Loading files from Google Drive...';
			case 'processing':
				return 'Processing and saving files...';
			case 'permissions':
				return 'Syncing file permissions...';
			case 'complete':
				return 'Sync completed successfully!';
			case 'error':
				return 'Sync failed';
			default:
				return 'Ready to sync';
		}
	}

	function getPhaseIcon(phase: SyncPhase) {
		switch (phase) {
			case 'idle':
				return Play;
			case 'counting':
				return Database;
			case 'loading':
				return FileText;
			case 'processing':
				return FolderSync;
			case 'permissions':
				return Shield;
			case 'complete':
				return Check;
			case 'error':
				return X;
			default:
				return Play;
		}
	}

	/**
	 * Start the sync process
	 */
	async function startSync() {
		if (isSyncing) return;

		try {
			console.log('🚀 Starting sync...');
			isSyncing = true;
			currentPhase = 'counting';
			progress = 0;
			done = 0;
			total = 0;
			currentMessage = 'Starting sync...';
			syncStats = null;

			// Start the sync process
			const response = await fetch('/api/drive/sync?action=start', {
				method: 'GET'
			});

			if (!response.ok) {
				throw new Error(`Failed to start sync: ${response.statusText}`);
			}

			const result = await response.json();
			console.log('✅ Sync started:', result);
			connectToProgress();
		} catch (error) {
			console.error('❌ Failed to start sync:', error);
			currentPhase = 'error';
			currentMessage = error instanceof Error ? error.message : 'Failed to start sync';
			isSyncing = false;
		}
	}

	/**
	 * Stop the sync process
	 */
	function stopSync() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		isSyncing = false;
		currentPhase = 'idle';
		currentMessage = 'Sync stopped';
	}

	/**
	 * Connect to Server-Sent Events for real-time progress updates
	 */
	function connectToProgress() {
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource('/api/drive/sync?action=progress');

		eventSource.onopen = () => {
			console.log('🔗 SSE connection established');
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				handleProgressEvent(data);
			} catch (error) {
				console.error('Error parsing SSE event:', error);
			}
		};

		eventSource.onerror = (error) => {
			console.error('SSE connection error:', error);
			if (isSyncing) {
				// Try to reconnect after a delay
				setTimeout(() => {
					if (isSyncing) {
						connectToProgress();
					}
				}, 2000);
			}
		};
	}

	/**
	 * Handle progress events from SSE
	 */
	function handleProgressEvent(event: any) {
		console.log('📡 Received SSE event:', event);

		switch (event.type) {
			case 'connected':
				console.log('✅ Connected to progress updates');
				break;

			case 'sync_start':
				currentPhase = 'counting';
				currentMessage = 'Starting sync process...';
				break;

			case 'page_loaded':
				currentPhase = 'loading';
				total = event.total;
				done = event.done;
				progress = event.percent || 0;
				currentMessage = event.message || 'Loading files...';
				break;

			case 'file_processed':
				currentPhase = event.percent < 60 ? 'processing' : 'permissions';
				total = event.total;
				done = event.done;
				progress = event.percent || 0;
				currentMessage = event.message || 'Processing files...';
				break;

			case 'sync_complete':
				currentPhase = 'complete';
				progress = 100;
				done = total;
				currentMessage = 'Sync completed successfully!';
				syncStats = event.stats;
				isSyncing = false;

				// Close SSE connection
				if (eventSource) {
					eventSource.close();
					eventSource = null;
				}
				break;

			case 'sync_error':
				currentPhase = 'error';
				currentMessage = `Error: ${event.error}`;
				isSyncing = false;

				// Close SSE connection
				if (eventSource) {
					eventSource.close();
					eventSource = null;
				}
				break;

			case 'ping':
				// Keep-alive ping, no action needed
				break;

			default:
				console.log('Unknown event type:', event.type);
		}
	}

	/**
	 * Format duration in human-readable format
	 */
	function formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	}

	/**
	 * Format file size in human-readable format
	 */
	function formatFileSize(bytes: number): string {
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}

	// Lifecycle methods
	onMount(() => {
		console.log('📱 Sync page mounted');
		// Connect to SSE when component mounts if syncing is in progress
		if (isSyncing) {
			connectToProgress();
		}
	});

	onDestroy(() => {
		console.log('📱 Sync page destroyed');
		if (eventSource) {
			eventSource.close();
		}
	});
</script>

<svelte:head>
	<title>Google Drive Sync - Admin</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold mb-2 flex items-center gap-3">
			<Cloud class="w-8 h-8" />
			Google Drive Sync
		</h1>
		<p class="text-muted-foreground">
			Synchronize metadata from Google Drive to PostgreSQL database
		</p>
	</div>

	<!-- Main Sync Card -->
	<Card class="p-6 mb-6">
		<div class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<svelte:component this={phaseIcon} class="w-6 h-6" />
				<div>
					<h2 class="text-xl font-semibold">Sync Progress</h2>
					<p class="text-sm text-muted-foreground">{phaseMessage}</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				{#if isSyncing}
					<Button variant="outline" onclick={stopSync} class="flex items-center gap-2">
						<Square class="w-4 h-4" />
						Stop
					</Button>
				{:else}
					<Button onclick={startSync} disabled={isSyncing} class="flex items-center gap-2">
						<Play class="w-4 h-4" />
						Start Sync
					</Button>
				{/if}
			</div>
		</div>

		<!-- Progress Section -->
		{#if isSyncing || progress > 0}
			<div class="space-y-4">
				<!-- Progress Bar -->
				<div class="space-y-2">
					<div class="flex justify-between text-sm">
						<span>Progress</span>
						<span>{Math.round(progress)}%</span>
					</div>
					<Progress value={progress} class="w-full" />
					<div class="flex justify-between text-xs text-muted-foreground">
						<span>{done.toLocaleString()} of {total.toLocaleString()} items</span>
						<span>{currentMessage}</span>
					</div>
				</div>

				<!-- Current Phase Indicator -->
				<div class="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
					<svelte:component this={phaseIcon} class="w-4 h-4" />
					<span class="text-sm font-medium">{currentMessage}</span>
				</div>
			</div>
		{/if}

		<!-- Completion Stats -->
		{#if syncStats}
			<div
				class="mt-6 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800"
			>
				<div class="flex items-center gap-2 mb-3">
					<Check class="w-5 h-5 text-green-600" />
					<h3 class="font-semibold text-green-800 dark:text-green-200">
						Sync Completed Successfully
					</h3>
				</div>

				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
					<div class="text-center">
						<div class="font-semibold text-lg">{syncStats.processedFiles.toLocaleString()}</div>
						<div class="text-muted-foreground">Files Processed</div>
					</div>
					<div class="text-center">
						<div class="font-semibold text-lg">
							{syncStats.processedPermissions.toLocaleString()}
						</div>
						<div class="text-muted-foreground">Permissions Synced</div>
					</div>
					<div class="text-center">
						<div class="font-semibold text-lg">{syncStats.errors}</div>
						<div class="text-muted-foreground">Errors</div>
					</div>
					<div class="text-center">
						<div class="font-semibold text-lg">{formatDuration(syncStats.processingTime)}</div>
						<div class="text-muted-foreground">Duration</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Error State -->
		{#if currentPhase === 'error'}
			<div
				class="mt-6 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800"
			>
				<div class="flex items-center gap-2 mb-2">
					<X class="w-5 h-5 text-red-600" />
					<h3 class="font-semibold text-red-800 dark:text-red-200">Sync Failed</h3>
				</div>
				<p class="text-red-700 dark:text-red-300">{currentMessage}</p>
			</div>
		{/if}
	</Card>

	<!-- Status Card -->
	<Card class="p-6">
		<h3 class="text-lg font-semibold mb-4">System Status</h3>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
			<div class="flex items-center gap-3">
				<Database class="w-4 h-4 text-blue-500" />
				<div>
					<div class="font-medium">Database</div>
					<div class="text-muted-foreground">PostgreSQL Ready</div>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<Cloud class="w-4 h-4 text-green-500" />
				<div>
					<div class="font-medium">Google Drive</div>
					<div class="text-muted-foreground">Service Account Auth</div>
				</div>
			</div>

			<div class="flex items-center gap-3">
				<FolderSync class="w-4 h-4 text-purple-500" />
				<div>
					<div class="font-medium">Real-time Updates</div>
					<div class="text-muted-foreground">{eventSource ? 'Connected' : 'Disconnected'}</div>
				</div>
			</div>
		</div>
	</Card>
</div>

<style>
	:global(body) {
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}
</style>

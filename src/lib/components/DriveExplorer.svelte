<script lang="ts">
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import type { FilesResponse } from '../../routes/files/+page.server';

	// State for navigation
	const root = { id: 'root', name: 'root' } as FilesResponse['files'][number];

	let currentFolder = $state(root);
	let folderStack = $state<FilesResponse['files']>([]);
	let {
		files = $bindable([] as FilesResponse['files']),
		breadcrumb = $bindable([]),
		isLoading = $bindable(false),
		...restProps
	} = $props();
	const loadFolder: (
		folder: FilesResponse['files'][number],
		direction?: 'next' | 'prev'
	) => Promise<void> = restProps.loadFolder;
	// let breadcrumb = $state<string[]>(['root']);

	// Load folder contents
	// async function loadFolder(folder: FilesResponse['files'][number]) {
	// 	isLoading = true;
	// 	try {
	// 		const folderId = folder.id || page.url.searchParams.get('folderId');
	// 		const response = await fetch(`/api/drive/list?folderId=${folderId}`);
	// 		const data = await response.json();
	// 		console.log('Data == ', data, folderId);

	// 		files = data.files || [];

	// 		// Update breadcrumb

	// 		if (folderId === 'root') {
	// 			breadcrumb = [root];
	// 		} else {
	// 			// In a real implementation, you'd need to get folder names for breadcrumb
	// 			// For now, just show the current folder ID
	// 			breadcrumb = [root, folderId];
	// 		}
	// 	} catch (error) {
	// 		console.error('Error loading folder:', error);
	// 		files = [];
	// 	} finally {
	// 		isLoading = false;
	// 	}
	// }

	// Navigate to folder
	async function openFolder(folder: FilesResponse['files'][number]) {
		folderStack = [...folderStack, currentFolder];
		isLoading = true;
		const id = folder.id || '';
		await loadFolder(folder);
		isLoading = false;
		currentFolder = folder;
	}

	// Initialize with root folder
	// onMount(() => {
	// 	loadFolder(root);
	// });
</script>

<div class="p-4">
	<Table>
		<TableHeader class="">
			<TableRow>
				<TableHead>Name</TableHead>
				<TableHead>Type</TableHead>
				<TableHead>Modified</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			{#if isLoading}
				<div class="text-center py-8 text-xl text-gray-600">Loading...</div>
			{:else}
				{#each files as file}
					<TableRow
						class={file.mimeType === 'application/vnd.google-apps.folder'
							? 'folder cursor-pointer'
							: 'file'}
					>
						<TableCell
							onclick={async () => {
								if (file.mimeType === 'application/vnd.google-apps.folder') {
									openFolder(file);
								}
							}}
						>
							{file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}
							{file.name}
						</TableCell>
						<TableCell>{file.mimeType}</TableCell>
						<TableCell>{new Date(file.modifiedTime ?? '').toLocaleDateString()}</TableCell>
					</TableRow>
				{/each}
			{/if}
		</TableBody>
	</Table>
</div>

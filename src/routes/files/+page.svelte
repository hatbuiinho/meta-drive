<script lang="ts">
	import DriveExplorer from '@/components/DriveExplorer.svelte';
	import type { FilesResponse } from './+page.server.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '@/components/AppSidebar.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { page } from '$app/state';

	let { data } = $props();
	const root = { id: 'root', name: 'root' } as FilesResponse['files'][number];

	let breadcrumb = $state<FilesResponse['files']>([root]);
	let isLoading = $state(false);

	async function loadFolder(folder: FilesResponse['files'][number], type?: 'next' | 'prev') {
		try {
			const folderId = folder.id || page.url.searchParams.get('folderId');
			// Update breadcrumb
			if (folderId === 'root') {
				breadcrumb = [root];
			} else if (type != 'prev') {
				// breadcrumb = breadcrumb.slice(0, breadcrumb.length - 1);
				breadcrumb = [...breadcrumb, folder];
			} else {
				// In a real implementation, you'd need to get folder names for breadcrumb
				// For now, just show the current folder ID
			}
			const response = await fetch(`/api/drive/list?folderId=${folderId}`);
			const res = await response.json();
			data = { ...data, files: res.files };
		} catch (error) {
			console.error('Error loading folder:', error);
			data = { ...data, files: [] };
		} finally {
		}
	}
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		<header class="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 bg-white">
			<Sidebar.Trigger class="-ms-1" />
			<Separator orientation="vertical" class="me-2 h-4" />
			<Breadcrumb.Root>
				<Breadcrumb.List>
					{#each breadcrumb as file, id}
						{#if id === breadcrumb.length - 1}
							<Breadcrumb.Item>
								<Breadcrumb.Page>{file.name}</Breadcrumb.Page>
							</Breadcrumb.Item>
						{:else}
							<Breadcrumb.Item>
								<Button
									variant="ghost"
									size="sm"
									onclick={async () => {
										console.log('else', file.id);
										breadcrumb = breadcrumb.slice(0, id + 1);
										isLoading = true;
										await loadFolder(file, 'prev');
										isLoading = false;
									}}>{file.name}</Button
								>
							</Breadcrumb.Item>
							<Breadcrumb.Separator class="hidden md:block" />
						{/if}
					{/each}
				</Breadcrumb.List>
			</Breadcrumb.Root>
		</header>
		<div class="flex flex-1 flex-col gap-4 p-4">
			<DriveExplorer bind:breadcrumb bind:files={data.files} {loadFolder} bind:isLoading />
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

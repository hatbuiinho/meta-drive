<script lang="ts">
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	let { files = [] } = $props();
</script>

<Table>
	<TableHeader>
		<TableRow>
			<TableHead>Name</TableHead>
			<TableHead>Type</TableHead>
			<TableHead>Modified</TableHead>
		</TableRow>
	</TableHeader>
	<TableBody>
		{#each files as file}
			<TableRow>
				<TableCell>{file.name}</TableCell>
				<TableCell>{file.mimeType}</TableCell>
				<TableCell>{new Date(file.modifiedTime).toLocaleDateString()}</TableCell>
			</TableRow>
		{/each}
	</TableBody>
</Table>

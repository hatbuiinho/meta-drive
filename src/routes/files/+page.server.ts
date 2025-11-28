import { getFileList } from '@services/files';

export const load = async ({ url }) => {
	const response = await getFileList(url);
	const folderId = url.searchParams.get('folderId') || 'root';
	return {
		files: response.data.files || [],
		currentFolder: folderId
	};
};

export type FilesResponse = Awaited<ReturnType<typeof load>>;

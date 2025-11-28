import { getFileList } from '@services/files';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const response = await getFileList(url);
	return new Response(
		JSON.stringify({
			files: response.data.files || []
		}),
		{
			headers: { 'Content-Type': 'application/json' }
		}
	);
};

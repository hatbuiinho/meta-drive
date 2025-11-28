import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const keyPath = join(process.cwd(), 'meta-drive.json');
	const key = JSON.parse(readFileSync(keyPath, 'utf-8'));

	const auth = new google.auth.GoogleAuth({
		credentials: key,
		scopes: ['https://www.googleapis.com/auth/drive.readonly']
	});

	const drive = google.drive({ version: 'v3', auth });
	const folderId = url.searchParams.get('folder');

	let query = '';
	if (folderId) {
		query = `'${folderId}' in parents`;
	}

	const response = await drive.files.list({
		q: query,
		fields: 'files(id, name, mimeType, modifiedTime, parents)'
	});

	return {
		files: response.data.files || [],
		currentFolder: folderId
	};
};

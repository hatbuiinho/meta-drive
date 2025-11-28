import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function getFileList(url: URL) {
	const drive = getDriveClient();
	const folderId = url.searchParams.get('folderId') || 'root';
	let query = '';
	if (folderId && folderId !== 'root') {
		query = `'${folderId}' in parents`;
	}
	const response = await drive.files.list({
		q: query,
		fields: 'files(id, name, mimeType, modifiedTime, parents)'
	});
	return response;
}

export const getDriveClient = () => {
	const keyPath = join(process.cwd(), 'meta-drive.json');
	const key = JSON.parse(readFileSync(keyPath, 'utf-8'));
	const auth = new google.auth.GoogleAuth({
		credentials: key,
		scopes: ['https://www.googleapis.com/auth/drive.readonly']
	});
	const drive = google.drive({ version: 'v3', auth });
	return drive;
};

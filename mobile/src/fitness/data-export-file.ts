import { Directory } from 'expo-file-system';

export async function saveExportFile(name: string, contents: string | Uint8Array, mimeType = 'application/json',
  encoding?: 'base64') {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (/CANCEL/i.test(code)) return false;
    throw error;
  }

  const file = directory.createFile(name, mimeType);
  try {
    await file.write(contents, { encoding });
    return true;
  } catch (error) {
    try {
      file.delete();
    } catch {
      // Keep the write error if the destination revoked access.
    }
    throw error;
  }
}

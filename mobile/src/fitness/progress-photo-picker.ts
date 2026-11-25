import { Directory, File, Paths } from 'expo-file-system';
import { launchImageLibraryAsync } from 'expo-image-picker';

import { photoExportName, type ProgressPhoto } from './progress-photo';
import { encodePhoto } from './progress-photo-encode';
import { saveExportFile } from './data-export-file';

function removeTemporary(uri: string, folder?: string) {
  const root = folder ? new Directory(Paths.cache, folder).uri : Paths.cache.uri;
  const prefix = root.endsWith('/') ? root : `${root}/`;
  if (!uri.startsWith(prefix) || uri.slice(prefix.length).split('/').includes('..')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A system-evicted cache item needs no cleanup.
  }
}

export async function selectProgressPhoto() {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], exif: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  try {
    return await encodePhoto(asset.uri, removeTemporary);
  } finally {
    removeTemporary(asset.uri, 'ImagePicker');
  }
}

export function exportProgressPhoto(photo: ProgressPhoto, jpeg: string) {
  return saveExportFile(photoExportName(photo), jpeg, 'image/jpeg', 'base64');
}

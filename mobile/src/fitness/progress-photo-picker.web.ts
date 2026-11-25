import { photoExportName, photoUri, type ProgressPhoto } from './progress-photo';
import { encodePhoto } from './progress-photo-encode';

function chooseFile() {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    function finish(file: File | null) {
      input.remove();
      resolve(file);
    }
    input.addEventListener('change', () => finish(input.files?.item(0) ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function selectProgressPhoto() {
  const file = await chooseFile();
  if (!file) return null;
  const uri = URL.createObjectURL(file);
  try {
    return await encodePhoto(uri);
  } finally {
    URL.revokeObjectURL(uri);
  }
}

export async function exportProgressPhoto(photo: ProgressPhoto, jpeg: string) {
  const link = document.createElement('a');
  link.href = photoUri(jpeg);
  link.download = photoExportName(photo);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  return true;
}

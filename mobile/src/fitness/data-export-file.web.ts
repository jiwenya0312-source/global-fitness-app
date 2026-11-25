export async function saveExportFile(name: string, contents: string | Uint8Array,
  mimeType = 'application/json;charset=utf-8', encoding?: 'base64') {
  const bytes = typeof contents === 'string'
    ? encoding === 'base64' ? Uint8Array.from(atob(contents), (byte) => byte.charCodeAt(0)) : contents
    : new Uint8Array(contents);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
    return true;
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

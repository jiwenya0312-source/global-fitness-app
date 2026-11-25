import { toPng } from 'html-to-image';
import type { ComponentRef } from 'react';
import type { View } from 'react-native';

import { saveExportFile } from './data-export-file';

export async function capturePoster(target: ComponentRef<typeof View>) {
  if (!(target instanceof HTMLElement)) throw new Error('Poster view is unavailable');
  const url = await toPng(target, { pixelRatio: Math.min(3, 1080 / target.offsetWidth), skipFonts: true });
  if (!url.startsWith('data:image/png;base64,')) throw new Error('Poster rendering failed');
  return url.slice('data:image/png;base64,'.length);
}

export function sharePoster(name: string, base64: string) {
  return saveExportFile(name, base64, 'image/png', 'base64');
}

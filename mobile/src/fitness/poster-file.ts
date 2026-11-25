import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { ComponentRef } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export function capturePoster(target: ComponentRef<typeof View>) {
  return captureRef(target, { format: 'png', result: 'base64' });
}

export async function sharePoster(name: string, base64: string) {
  if (!await isAvailableAsync()) return false;
  const file = new File(Paths.cache, name);
  await file.write(base64, { encoding: 'base64' });
  await shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
  return true;
}

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { photoDecodeBounds, validPhotoImage, type PhotoImage } from './progress-photo';

export async function encodePhoto(uri: string, removeTemporary?: (uri: string) => void): Promise<PhotoImage> {
  const context = ImageManipulator.manipulate(uri, photoDecodeBounds);
  try {
    const ref = await context.renderAsync();
    try {
      const result = await ref.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.8 });
      try {
        const image = { jpeg: result.base64 ?? '', width: result.width, height: result.height };
        if (!validPhotoImage(image)) throw new Error('The selected image could not be prepared.');
        return image;
      } finally {
        removeTemporary?.(result.uri);
      }
    } finally {
      ref.release();
    }
  } finally {
    context.release();
  }
}

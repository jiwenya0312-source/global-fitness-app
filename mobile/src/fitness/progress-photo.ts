import { isDay } from './calendar';

export const photoAngles = ['photoFront', 'photoSide', 'photoBack'] as const;
export type PhotoAngle = typeof photoAngles[number];

export type PhotoDetails = {
  day: string;
  angle: PhotoAngle;
  width: number;
  height: number;
};

export type ProgressPhoto = PhotoDetails & { id: number };
export type PhotoImage = Pick<PhotoDetails, 'width' | 'height'> & { jpeg: string };

const maxImageDimension = 1600;
export const photoDecodeBounds = { maxWidth: maxImageDimension, maxHeight: maxImageDimension };

export function validPhotoDay(day: string, today: string) {
  return day >= '0001-01-01' && day <= today && isDay(day);
}

export function validPhotoImage(image: PhotoImage) {
  return Number.isInteger(image.width) && image.width > 0 && image.width <= maxImageDimension &&
    Number.isInteger(image.height) && image.height > 0 && image.height <= maxImageDimension &&
    image.jpeg.startsWith('/9j/') && image.jpeg.length <= 2_000_000;
}

export function photoUri(jpeg: string) {
  return `data:image/jpeg;base64,${jpeg}`;
}

export function photoExportName(photo: ProgressPhoto) {
  return `progress-${photo.day}-${photo.angle.slice(5).toLowerCase()}-${Date.now()}.jpg`;
}

export function comparePair(first: ProgressPhoto, second: ProgressPhoto) {
  if (first.id === second.id || first.angle !== second.angle) return null;
  return first.day < second.day ? [first, second] as const : [second, first] as const;
}

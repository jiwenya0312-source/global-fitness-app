import { openDatabase, progressPhotos, progressPhotoImages } from './profile-store.web';
import type { PhotoDetails, ProgressPhoto } from './progress-photo';

export async function readProgressPhotos() {
  const db = await openDatabase();
  try {
    return await new Promise<ProgressPhoto[]>((resolve, reject) => {
      const tx = db.transaction(progressPhotos);
      const photos = tx.objectStore(progressPhotos).getAll();
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve((photos.result as ProgressPhoto[]).sort((a, b) =>
        b.day.localeCompare(a.day) || b.id - a.id));
    });
  } finally {
    db.close();
  }
}

export async function readProgressImage(id: number) {
  const db = await openDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(progressPhotoImages);
      const image = tx.objectStore(progressPhotoImages).get(id);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(image.result ?? null);
    });
  } finally {
    db.close();
  }
}

async function changePhotos(change: (photos: IDBObjectStore, images: IDBObjectStore, applied: () => void) => void) {
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction([progressPhotos, progressPhotoImages], 'readwrite');
      let changed = false;
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(changed);
      change(tx.objectStore(progressPhotos), tx.objectStore(progressPhotoImages), () => { changed = true; });
    });
  } finally {
    db.close();
  }
}

export function saveProgressPhoto(details: PhotoDetails, jpeg: string) {
  return changePhotos((photos, images, applied) => {
    const existing = photos.index('slot').getKey([details.day, details.angle]);
    existing.onsuccess = () => {
      if (existing.result !== undefined) return;
      const added = photos.add(details);
      added.onsuccess = () => {
        images.add(jpeg, added.result);
        applied();
      };
    };
  });
}

export function deleteProgressPhoto(id: number) {
  return changePhotos((photos, images, applied) => {
    const existing = photos.getKey(id);
    existing.onsuccess = () => {
      if (existing.result === undefined) return;
      photos.delete(id);
      images.delete(id);
      applied();
    };
  });
}

import { getDatabase, localUser } from './profile-store';
import type { PhotoDetails, ProgressPhoto } from './progress-photo';

export async function readProgressPhotos() {
  const db = await getDatabase();
  return db.getAllAsync<ProgressPhoto>(`
    SELECT id, day, angle, width, height FROM progress_photos
    WHERE user_id = ? ORDER BY day DESC, id DESC
  `, localUser);
}

export async function readProgressImage(id: number) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ jpeg: string }>(
    'SELECT jpeg FROM progress_photos WHERE user_id = ? AND id = ?', localUser, id,
  );
  return row?.jpeg ?? null;
}

export async function saveProgressPhoto(details: PhotoDetails, jpeg: string) {
  const db = await getDatabase();
  const result = await db.runAsync(`
    INSERT INTO progress_photos (user_id, day, angle, width, height, jpeg)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day, angle) DO NOTHING
  `, localUser, details.day, details.angle, details.width, details.height, jpeg);
  return result.changes > 0;
}

export async function deleteProgressPhoto(id: number) {
  const db = await getDatabase();
  await db.execAsync('PRAGMA secure_delete = ON');
  const result = await db.runAsync('DELETE FROM progress_photos WHERE user_id = ? AND id = ?', localUser, id);
  return result.changes > 0;
}

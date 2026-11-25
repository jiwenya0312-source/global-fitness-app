import type { BodyRecord, Measurements } from './body-measurements';
import { getDatabase, localUser } from './profile-store';

export async function readBodyRecords(): Promise<BodyRecord[]> {
  const db = await getDatabase();
  return db.getAllAsync<BodyRecord>(`
    SELECT id, day, version, weight_kg AS weightKg, waist_cm AS waistCm, updated_at AS updatedAt
    FROM body_measurements WHERE user_id = ? ORDER BY day DESC
  `, localUser);
}

export async function saveBodyRecord(day: string, values: Measurements, previous?: BodyRecord) {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  const result = previous
    ? await db.runAsync(`
        UPDATE body_measurements SET day = ?, weight_kg = ?, waist_cm = ?, version = version + 1, updated_at = ?
        WHERE user_id = ? AND id = ? AND version = ? AND NOT EXISTS (
          SELECT 1 FROM body_measurements WHERE user_id = ? AND day = ? AND id <> ?
        )
      `, day, values.weightKg, values.waistCm, updatedAt, localUser, previous.id, previous.version,
      localUser, day, previous.id)
    : await db.runAsync(`
        INSERT INTO body_measurements (user_id, day, version, weight_kg, waist_cm, updated_at)
        VALUES (?, ?, 0, ?, ?, ?) ON CONFLICT(user_id, day) DO NOTHING
      `, localUser, day, values.weightKg, values.waistCm, updatedAt);
  return result.changes > 0;
}

export async function deleteBodyRecord(record: BodyRecord) {
  const db = await getDatabase();
  const result = await db.runAsync('DELETE FROM body_measurements WHERE user_id = ? AND id = ? AND version = ?',
    localUser, record.id, record.version);
  return result.changes > 0;
}

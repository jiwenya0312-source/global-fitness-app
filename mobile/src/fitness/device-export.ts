import type { DeviceFitnessData } from './device-export-types';
import { getDatabase, localUser } from './profile-store';

type PayloadRow = { payload: string };

function payload<T>({ payload }: PayloadRow): T {
  return JSON.parse(payload) as T;
}

export async function readDeviceFitnessData(): Promise<DeviceFitnessData> {
  const db = await getDatabase();
  let snapshot: DeviceFitnessData | undefined;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const [profiles, plans, sessions, recovery, food, goals, measurements, photoIndex] = await Promise.all([
      tx.getAllAsync<PayloadRow & { savedAt: string }>(`
        SELECT payload, saved_at AS savedAt FROM body_profiles WHERE user_id = ? ORDER BY revision_id
      `, localUser),
      tx.getAllAsync<PayloadRow & { savedAt: string; profileSavedAt: string }>(`
        SELECT payload, saved_at AS savedAt, profile_saved_at AS profileSavedAt
        FROM workout_plans WHERE user_id = ? ORDER BY revision_id
      `, localUser),
      tx.getAllAsync<PayloadRow & { id: number }>(`
        SELECT id, payload FROM workout_sessions WHERE user_id = ? ORDER BY id
      `, localUser),
      tx.getAllAsync<PayloadRow>(`
        SELECT payload FROM recovery_reviews WHERE user_id = ? ORDER BY id
      `, localUser),
      tx.getAllAsync<PayloadRow & { id: number; day: string; version: number }>(`
        SELECT id, day, version, payload FROM nutrition_entries WHERE user_id = ? ORDER BY id
      `, localUser),
      tx.getFirstAsync<PayloadRow & { version: number }>(`
        SELECT version, payload FROM nutrition_goals WHERE user_id = ?
      `, localUser),
      tx.getAllAsync<DeviceFitnessData['measurements'][number]>(`
        SELECT id, day, version, weight_kg AS weightKg, waist_cm AS waistCm, updated_at AS updatedAt
        FROM body_measurements WHERE user_id = ? ORDER BY day
      `, localUser),
      tx.getAllAsync<DeviceFitnessData['photoIndex'][number]>(`
        SELECT id, day, angle, width, height FROM progress_photos WHERE user_id = ? ORDER BY day, id
      `, localUser),
    ]);
    snapshot = {
      profiles: profiles.map(({ savedAt, ...row }) => ({ savedAt, profile: payload(row) })),
      plans: plans.map(({ savedAt, profileSavedAt, ...row }) => ({ savedAt, profileSavedAt, plan: payload(row) })),
      workouts: sessions.map((row) => ({ ...payload<Omit<DeviceFitnessData['workouts'][number], 'id'>>(row), id: row.id })),
      recovery: recovery.map(payload<DeviceFitnessData['recovery'][number]>),
      foodEntries: food.map((row) => ({
        ...payload<Omit<DeviceFitnessData['foodEntries'][number], 'id' | 'day' | 'version'>>(row),
        id: row.id, version: row.version, day: row.day,
      })),
      nutritionGoals: goals ? { version: goals.version, values: payload(goals) } : null,
      measurements,
      photoIndex,
    };
  });
  if (!snapshot) throw new Error('Device data could not be read.');
  return snapshot;
}

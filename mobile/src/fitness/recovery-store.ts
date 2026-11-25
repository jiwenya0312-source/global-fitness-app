import { getDatabase, localUser } from './profile-store';
import type { RecoveryReview } from './recovery';

export async function readRecovery(): Promise<RecoveryReview | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string }>(`
    SELECT payload FROM recovery_reviews WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `, localUser);
  return row ? JSON.parse(row.payload) as RecoveryReview : null;
}

export async function readRecoveryHistory(): Promise<RecoveryReview[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM recovery_reviews WHERE user_id = ? ORDER BY id DESC', localUser,
  );
  return rows.map(({ payload }) => JSON.parse(payload) as RecoveryReview);
}

export async function saveRecovery(review: RecoveryReview) {
  const db = await getDatabase();
  const result = await db.runAsync(`
    INSERT INTO recovery_reviews (user_id, payload)
    SELECT ?, ?
    WHERE ? = (
      SELECT saved_at FROM body_profiles WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1
    )
    AND ? IS (
      SELECT CASE WHEN profile_saved_at = ? THEN saved_at END
      FROM workout_plans WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1
    )
    AND ? IS (
      SELECT id FROM workout_sessions
      WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY ended_at DESC, id DESC LIMIT 1
    )
  `, localUser, JSON.stringify(review), review.profileSavedAt, localUser,
  review.planSavedAt, review.profileSavedAt, localUser, review.latestWorkoutId, localUser);
  return result.changes > 0;
}

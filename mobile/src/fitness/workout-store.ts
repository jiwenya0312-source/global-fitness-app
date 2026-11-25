import type { BodyProfile } from './profile';
import { getDatabase, localUser } from './profile-store';
import { hasWorkoutRecords, newSession, type WorkoutLog, type WorkoutSession } from './workout-log';
import type { PlanRevision } from './workout-plan';

type SessionRow = { id: number; payload: string };

function fromRow({ id, payload }: SessionRow): WorkoutSession {
  return { ...JSON.parse(payload) as Omit<WorkoutSession, 'id'>, id };
}

export async function readWorkoutLog(): Promise<WorkoutLog> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(`
    SELECT id, payload FROM workout_sessions WHERE user_id = ? ORDER BY id DESC
  `, localUser);
  const sessions = rows.map(fromRow);
  return {
    active: sessions.find((session) => !session.endedAt) ?? null,
    history: sessions.filter((session) => session.endedAt),
  };
}

export async function startWorkout(plan: PlanRevision, day: number, units: BodyProfile['units'],
  options?: Parameters<typeof newSession>[4]) {
  const draft = newSession(plan, day, units, undefined, options);
  const db = await getDatabase();
  const result = await db.runAsync(`
    INSERT INTO workout_sessions (user_id, version, ended_at, payload)
    SELECT ?, 0, NULL, ?
    WHERE ? = (
      SELECT saved_at FROM workout_plans WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1
    )
    AND ? = (
      SELECT saved_at FROM body_profiles WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM workout_sessions WHERE user_id = ? AND ended_at IS NULL
    )
  `, localUser, JSON.stringify(draft), plan.savedAt, localUser, plan.profileSavedAt, localUser, localUser);
  return result.changes ? { ...draft, id: result.lastInsertRowId } : null;
}

export async function updateWorkout(session: WorkoutSession) {
  const db = await getDatabase();
  const next = { ...session, version: session.version + 1 };
  const result = await db.runAsync(`
    UPDATE workout_sessions SET payload = ?, version = ?, ended_at = ?
    WHERE id = ? AND user_id = ? AND version = ? AND ended_at IS NULL
  `, JSON.stringify(next), next.version, next.endedAt, session.id, localUser, session.version);
  return result.changes ? next : null;
}

export async function discardEmptyWorkout(session: WorkoutSession) {
  if (hasWorkoutRecords(session)) return false;
  const db = await getDatabase();
  const result = await db.runAsync(`
    DELETE FROM workout_sessions WHERE id = ? AND user_id = ? AND version = ? AND ended_at IS NULL
  `, session.id, localUser, session.version);
  return result.changes > 0;
}

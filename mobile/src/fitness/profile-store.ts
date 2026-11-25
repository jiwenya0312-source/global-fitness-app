import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { BodyProfile, ProfileRevision } from './profile';
import type { PlanRevision, WorkoutPlan } from './workout-plan';

let connection: Promise<SQLiteDatabase> | undefined;

async function openProfileDatabase() {
  const db = await openDatabaseAsync('fitness.db');
  try {
    const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (version < 11) {
      await db.withTransactionAsync(async () => {
        if (version < 1) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS body_profiles (
              revision_id INTEGER PRIMARY KEY,
              user_id TEXT NOT NULL,
              saved_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS body_profiles_user_revision
              ON body_profiles (user_id, revision_id);
          `);
        }
        if (version < 2) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS workout_plans (
              revision_id INTEGER PRIMARY KEY,
              user_id TEXT NOT NULL,
              profile_saved_at TEXT NOT NULL,
              saved_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS workout_plans_user_revision
              ON workout_plans (user_id, revision_id);
          `);
        }
        if (version < 3) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS workout_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              version INTEGER NOT NULL,
              ended_at TEXT,
              payload TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_one_active
              ON workout_sessions (user_id) WHERE ended_at IS NULL;
            CREATE INDEX IF NOT EXISTS workout_sessions_user_id
              ON workout_sessions (user_id, id);
          `);
        }
        if (version < 4) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS recovery_reviews (
              id INTEGER PRIMARY KEY,
              user_id TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS recovery_reviews_user_id ON recovery_reviews (user_id, id);
            CREATE INDEX IF NOT EXISTS workout_sessions_user_end ON workout_sessions (user_id, ended_at, id);
          `);
        }
        if (version < 5) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS nutrition_goals (
              user_id TEXT PRIMARY KEY NOT NULL,
              version INTEGER NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS nutrition_entries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              day TEXT NOT NULL,
              version INTEGER NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS nutrition_entries_user_day ON nutrition_entries (user_id, day, id);
            CREATE INDEX IF NOT EXISTS nutrition_entries_user_id ON nutrition_entries (user_id, id);
          `);
        }
        if (version < 6) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS body_measurements (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              day TEXT NOT NULL,
              version INTEGER NOT NULL,
              weight_kg REAL CHECK (weight_kg > 0),
              waist_cm REAL CHECK (waist_cm > 0),
              updated_at TEXT NOT NULL,
              UNIQUE (user_id, day),
              CHECK (weight_kg IS NOT NULL OR waist_cm IS NOT NULL)
            );
          `);
        }
        if (version < 7) {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS progress_photos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              day TEXT NOT NULL,
              angle TEXT NOT NULL CHECK (angle IN ('photoFront', 'photoSide', 'photoBack')),
              width INTEGER NOT NULL CHECK (width > 0),
              height INTEGER NOT NULL CHECK (height > 0),
              jpeg TEXT NOT NULL,
              UNIQUE (user_id, day, angle)
            );
          `);
        }
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS account_body_workspaces (
            user_id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            payload TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS account_workout_workspaces (
            user_id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            payload TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS account_nutrition_workspaces (
            user_id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            payload TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS nutrition_meal_templates (
            user_id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL,
            payload TEXT NOT NULL
          );
          PRAGMA user_version = 11;
        `);
      });
    }
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

export function getDatabase() {
  connection ??= openProfileDatabase().catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export const localUser = 'local';

export async function readProfile(): Promise<ProfileRevision | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string; savedAt: string }>(
    'SELECT payload, saved_at AS savedAt FROM body_profiles WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1',
    localUser,
  );
  return row ? { profile: JSON.parse(row.payload) as BodyProfile, savedAt: row.savedAt } : null;
}

export async function saveProfile(profile: BodyProfile): Promise<ProfileRevision> {
  const db = await getDatabase();
  const savedAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO body_profiles (user_id, saved_at, payload) VALUES (?, ?, ?)',
    localUser, savedAt, JSON.stringify(profile),
  );
  return { profile, savedAt };
}

export async function readPlan(): Promise<PlanRevision | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payload: string; profileSavedAt: string; savedAt: string }>(`
    SELECT payload, profile_saved_at AS profileSavedAt, saved_at AS savedAt
    FROM workout_plans WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1
  `, localUser);
  return row ? {
    plan: JSON.parse(row.payload) as WorkoutPlan, profileSavedAt: row.profileSavedAt, savedAt: row.savedAt,
  } : null;
}

export async function savePlan(plan: WorkoutPlan, profileSavedAt: string): Promise<PlanRevision | null> {
  const db = await getDatabase();
  const savedAt = new Date().toISOString();
  const result = await db.runAsync(`
    INSERT INTO workout_plans (user_id, profile_saved_at, saved_at, payload)
    SELECT ?, ?, ?, ?
    WHERE ? = (
      SELECT saved_at FROM body_profiles WHERE user_id = ? ORDER BY revision_id DESC LIMIT 1
    )
  `, localUser, profileSavedAt, savedAt, JSON.stringify(plan), profileSavedAt, localUser);
  return result.changes ? { plan, profileSavedAt, savedAt } : null;
}

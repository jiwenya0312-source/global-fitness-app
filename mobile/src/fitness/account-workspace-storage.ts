import { getDatabase } from './profile-store';

export type WorkspaceKind = 'body' | 'workout' | 'nutrition' | 'mealTemplates';

const tables = {
  body: 'account_body_workspaces',
  workout: 'account_workout_workspaces',
  nutrition: 'account_nutrition_workspaces',
  mealTemplates: 'nutrition_meal_templates',
} as const;

export async function readWorkspace<T>(kind: WorkspaceKind, userId: string, empty: () => T) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ revision: number; payload: string }>(
    `SELECT revision, payload FROM ${tables[kind]} WHERE user_id = ?`, userId,
  );
  return row ? { revision: row.revision, workspace: JSON.parse(row.payload) as T }
    : { revision: 0, workspace: empty() };
}

export async function changeWorkspace<T>(kind: WorkspaceKind, userId: string, revision: number, workspace: T) {
  const db = await getDatabase();
  const payload = JSON.stringify(workspace);
  const result = revision === 0
    ? await db.runAsync(`
        INSERT INTO ${tables[kind]} (user_id, revision, payload) VALUES (?, 1, ?)
        ON CONFLICT(user_id) DO NOTHING
      `, userId, payload)
    : await db.runAsync(`
        UPDATE ${tables[kind]} SET revision = revision + 1, payload = ?
        WHERE user_id = ? AND revision = ?
      `, payload, userId, revision);
  return result.changes > 0;
}

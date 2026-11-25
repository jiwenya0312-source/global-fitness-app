import { foodPresets, type Food, type FoodEntry, type Nutrients, type NutritionDay, type NutritionGoals } from './nutrition';
import { getDatabase, localUser } from './profile-store';

type EntryRow = { id: number; day: string; version: number; payload: string };
type GoalRow = { version: number; payload: string };

function toEntry({ id, day, version, payload }: EntryRow): FoodEntry {
  return { ...JSON.parse(payload) as Food, id, day, version };
}

export async function readNutritionDay(day: string): Promise<NutritionDay> {
  const db = await getDatabase();
  const [entries, goals] = await Promise.all([
    db.getAllAsync<EntryRow>(`
      SELECT id, day, version, payload FROM nutrition_entries
      WHERE user_id = ? AND day = ? ORDER BY id
    `, localUser, day),
    db.getFirstAsync<GoalRow>('SELECT version, payload FROM nutrition_goals WHERE user_id = ?', localUser),
  ]);
  return {
    entries: entries.map(toEntry),
    goals: goals ? { version: goals.version, values: JSON.parse(goals.payload) as Nutrients } : null,
  };
}

export async function readRecentFoods() {
  const db = await getDatabase();
  const entries = await db.getAllAsync<EntryRow>(`
    SELECT id, day, version, payload FROM nutrition_entries WHERE user_id = ? ORDER BY id DESC LIMIT 100
  `, localUser);
  return foodPresets(entries.map(toEntry));
}

export async function readNutritionEntriesBetween(start: string, end: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EntryRow>(`
    SELECT id, day, version, payload FROM nutrition_entries
    WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day, id
  `, localUser, start, end);
  return rows.map(toEntry);
}

export async function readDeviceNutrition(): Promise<NutritionDay> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: number | null; day: string | null; version: number; payload: string }>(`
    SELECT NULL AS id, NULL AS day, version, payload FROM nutrition_goals WHERE user_id = ?
    UNION ALL
    SELECT id, day, version, payload FROM nutrition_entries WHERE user_id = ?
    ORDER BY id
  `, localUser, localUser);
  const entries: FoodEntry[] = [];
  let goals: NutritionGoals | null = null;
  for (const row of rows) {
    if (row.id === null || row.day === null) {
      goals = { version: row.version, values: JSON.parse(row.payload) as Nutrients };
    } else {
      entries.push(toEntry({ ...row, id: row.id, day: row.day }));
    }
  }
  return { entries, goals };
}

export async function saveNutritionEntry(day: string, food: Food, existing?: FoodEntry) {
  const db = await getDatabase();
  const payload = JSON.stringify(food);
  if (!existing) {
    await db.runAsync('INSERT INTO nutrition_entries (user_id, day, version, payload) VALUES (?, ?, 0, ?)',
      localUser, day, payload);
    return true;
  }
  const update = await db.runAsync(`
    UPDATE nutrition_entries SET version = version + 1, payload = ?
    WHERE user_id = ? AND day = ? AND id = ? AND version = ?
  `, payload, localUser, day, existing.id, existing.version);
  return update.changes > 0;
}

export async function saveNutritionMeal(day: string, foods: Food[]) {
  const db = await getDatabase();
  const result = await db.runAsync(`
    INSERT INTO nutrition_entries (user_id, day, version, payload)
    SELECT ?, ?, 0, value FROM json_each(?)
  `, localUser, day, JSON.stringify(foods));
  return result.changes === foods.length;
}

export async function deleteNutritionEntry(entry: FoodEntry) {
  const db = await getDatabase();
  const result = await db.runAsync(`
    DELETE FROM nutrition_entries WHERE user_id = ? AND id = ? AND version = ?
  `, localUser, entry.id, entry.version);
  return result.changes > 0;
}

export async function saveNutritionGoals(values: Nutrients, existing: NutritionGoals | null) {
  const db = await getDatabase();
  const payload = JSON.stringify(values);
  const result = existing
    ? await db.runAsync('UPDATE nutrition_goals SET version = version + 1, payload = ? WHERE user_id = ? AND version = ?',
      payload, localUser, existing.version)
    : await db.runAsync('INSERT INTO nutrition_goals (user_id, version, payload) VALUES (?, 0, ?) ON CONFLICT DO NOTHING',
      localUser, payload);
  return result.changes > 0;
}

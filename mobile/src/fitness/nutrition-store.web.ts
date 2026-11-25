import { foodPresets, type Food, type FoodEntry, type Nutrients, type NutritionDay, type NutritionGoals } from './nutrition';
import { nutritionEntries, nutritionGoals, openDatabase } from './profile-store.web';

const goalKey = 'daily';

export async function readNutritionDay(day: string): Promise<NutritionDay> {
  return readNutrition(day);
}

export function readDeviceNutrition() {
  return readNutrition();
}

export async function readNutritionEntriesBetween(start: string, end: string) {
  const db = await openDatabase();
  try {
    return await new Promise<FoodEntry[]>((resolve, reject) => {
      const tx = db.transaction(nutritionEntries);
      const request = tx.objectStore(nutritionEntries).index('day').getAll(IDBKeyRange.bound(start, end));
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

async function readNutrition(day?: string): Promise<NutritionDay> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([nutritionEntries, nutritionGoals]);
      const foods = tx.objectStore(nutritionEntries);
      const entries = day ? foods.index('day').getAll(day) : foods.getAll();
      const goals = tx.objectStore(nutritionGoals).get(goalKey);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve({ entries: entries.result, goals: goals.result ?? null });
    });
  } finally {
    db.close();
  }
}

export async function readRecentFoods() {
  const db = await openDatabase();
  try {
    return await new Promise<FoodEntry[]>((resolve, reject) => {
      const tx = db.transaction(nutritionEntries);
      const entries: FoodEntry[] = [];
      const request = tx.objectStore(nutritionEntries).openCursor(null, 'prev');
      request.onsuccess = () => {
        if (!request.result || entries.length >= 100) return;
        entries.push(request.result.value as FoodEntry);
        request.result.continue();
      };
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(foodPresets(entries));
    });
  } finally {
    db.close();
  }
}

async function change(table: string, operation: (store: IDBObjectStore, applied: () => void) => void) {
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(table, 'readwrite');
      let applied = false;
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(applied);
      operation(tx.objectStore(table), () => { applied = true; });
    });
  } finally {
    db.close();
  }
}

export function saveNutritionEntry(day: string, food: Food, existing?: FoodEntry) {
  return change(nutritionEntries, (store, applied) => {
    if (!existing) {
      store.add({ ...food, day, version: 0 });
      applied();
      return;
    }
    const request = store.get(existing.id);
    request.onsuccess = () => {
      const current: FoodEntry | undefined = request.result;
      if (current?.day !== day || current.version !== existing.version) return;
      store.put({ ...food, day, id: existing.id, version: existing.version + 1 });
      applied();
    };
  });
}

export function deleteNutritionEntry(entry: FoodEntry) {
  return change(nutritionEntries, (store, applied) => {
    const request = store.get(entry.id);
    request.onsuccess = () => {
      const current: FoodEntry | undefined = request.result;
      if (current?.version !== entry.version) return;
      store.delete(entry.id);
      applied();
    };
  });
}

export function saveNutritionMeal(day: string, foods: Food[]) {
  return change(nutritionEntries, (store, applied) => {
    for (const food of foods) store.add({ ...food, day, version: 0 });
    applied();
  });
}

export function saveNutritionGoals(values: Nutrients, existing: NutritionGoals | null) {
  return change(nutritionGoals, (store, applied) => {
    const request = store.get(goalKey);
    request.onsuccess = () => {
      const current: NutritionGoals | undefined = request.result;
      if (current?.version !== existing?.version) return;
      store.put({ values, version: (existing?.version ?? -1) + 1 }, goalKey);
      applied();
    };
  });
}

import type { WorkspaceKind } from './account-workspace-storage';
import {
  accountBodyWorkspaces, accountNutritionWorkspaces, accountWorkoutWorkspaces, nutritionMealTemplates, openDatabase,
} from './profile-store.web';

type Snapshot<T> = { revision: number; workspace: T };
const tables = {
  body: accountBodyWorkspaces, workout: accountWorkoutWorkspaces, nutrition: accountNutritionWorkspaces,
  mealTemplates: nutritionMealTemplates,
} as const;

export async function readWorkspace<T>(kind: WorkspaceKind, userId: string, empty: () => T) {
  const db = await openDatabase();
  try {
    return await new Promise<Snapshot<T>>((resolve, reject) => {
      const tx = db.transaction(tables[kind]);
      const read = tx.objectStore(tables[kind]).get(userId);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(read.result ?? { revision: 0, workspace: empty() });
    });
  } finally {
    db.close();
  }
}

export async function changeWorkspace<T>(kind: WorkspaceKind, userId: string, revision: number, workspace: T) {
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      let applied = false;
      const tx = db.transaction(tables[kind], 'readwrite');
      const store = tx.objectStore(tables[kind]);
      const read = store.get(userId);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(applied);
      read.onsuccess = () => {
        const current: Snapshot<T> | undefined = read.result;
        if ((current?.revision ?? 0) !== revision) return;
        store.put({ revision: revision + 1, workspace }, userId);
        applied = true;
      };
    });
  } finally {
    db.close();
  }
}

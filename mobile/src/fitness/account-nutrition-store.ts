import { randomUUID } from 'expo-crypto';

import {
  copyDeviceNutrition, editAccountNutrition, emptyNutritionWorkspace, goalsKey, resolveNutritionConflict,
  visibleNutrition, type AccountNutrition, type NutritionWorkspace, type NutritionValue,
} from './account-nutrition';
import { mutateAccountWorkspace } from './account-workspace';
import { readWorkspace } from './account-workspace-storage';
import { foodPresets, type Food, type FoodEntry, type NutritionGoals, type Nutrients } from './nutrition';
import { readDeviceNutrition } from './nutrition-store';

export async function readNutritionWorkspace(userId: string) {
  return (await readWorkspace('nutrition', userId, emptyNutritionWorkspace)).workspace;
}

export function mutateNutritionWorkspace(userId: string, change: (workspace: NutritionWorkspace) => NutritionWorkspace | null) {
  return mutateAccountWorkspace('nutrition', userId, emptyNutritionWorkspace, change);
}

export async function copyNutritionToAccount(userId: string) {
  const device = await readDeviceNutrition();
  let result = { copied: 0, copiedGoals: false };
  await mutateNutritionWorkspace(userId, (workspace) => {
    const { copied, copiedGoals, workspace: updated } = copyDeviceNutrition(workspace, device, randomUUID);
    result = { copied, copiedGoals };
    return updated;
  });
  return result;
}

export async function readAccountRecentFoods(userId: string) {
  const { entries } = visibleNutrition(await readNutritionWorkspace(userId));
  entries.sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id);
  return foodPresets(entries.slice(0, 100));
}

async function changeFood(userId: string, value: NutritionValue | null, existing?: FoodEntry) {
  const newKey = existing ? undefined : randomUUID();
  return Boolean(await mutateNutritionWorkspace(userId, (workspace) => {
    const key = existing
      ? workspace.rows.find((row) => row.id === existing.id && row.value?.kind === 'food')?.key : newKey;
    return key ? editAccountNutrition(workspace, key, value, existing?.version) : null;
  }));
}

export function saveAccountFood(userId: string, day: string, food: Food, existing?: FoodEntry) {
  return changeFood(userId, { kind: 'food', day, food }, existing);
}

export function deleteAccountFood(userId: string, existing: FoodEntry) {
  return changeFood(userId, null, existing);
}

export async function saveAccountMeal(userId: string, day: string, foods: Food[]) {
  const records = foods.map((food) => ({ key: randomUUID(), food }));
  return Boolean(await mutateNutritionWorkspace(userId, (workspace) => {
    let next = workspace;
    for (const { key, food } of records) {
      const updated = editAccountNutrition(next, key, { kind: 'food', day, food });
      if (!updated) return null;
      next = updated;
    }
    return next;
  }));
}

export async function saveAccountGoals(userId: string, values: Nutrients, existing: NutritionGoals | null) {
  return Boolean(await mutateNutritionWorkspace(userId, (workspace) =>
    editAccountNutrition(workspace, goalsKey, { kind: 'goals', values }, existing?.version)));
}

export function chooseNutritionVersion(userId: string, row: AccountNutrition, useCloud: boolean) {
  return mutateNutritionWorkspace(userId, (workspace) => resolveNutritionConflict(workspace, row, useCloud));
}

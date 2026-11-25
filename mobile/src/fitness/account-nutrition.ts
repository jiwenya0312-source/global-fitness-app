import { isDay } from './calendar';
import {
  bases, meals, nutrients, type Food, type FoodEntry, type NutritionDay, type NutritionGoals, type Nutrients,
} from './nutrition';

export const goalsKey = 'goals';
export type NutritionValue = { kind: 'goals'; values: Nutrients }
  | { kind: 'food'; day: string; food: Food };
export type CloudNutrition = { key: string; version: number; value: NutritionValue | null };
export type AccountNutrition = {
  id: number;
  key: string;
  revision: number;
  baseVersion: number | null;
  value: NutritionValue | null;
  pending: boolean;
  sourceId?: number;
  conflict: CloudNutrition | null;
};
export type NutritionWorkspace = { nextId: number; rows: AccountNutrition[] };

export function emptyNutritionWorkspace(): NutritionWorkspace {
  return { nextId: 1, rows: [] };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function amount(value: unknown, allowZero: boolean) {
  return typeof value === 'number' && Number.isFinite(value) && value <= 100000
    && (allowZero ? value >= 0 : value > 0) && Math.round(value * 1000) / 1000 === value;
}

function validNutrients(value: unknown, allowZero: boolean): value is Nutrients {
  return object(value) && nutrients.every((key) => amount(value[key], allowZero));
}

function validFood(value: unknown): value is Food {
  return object(value) && typeof value.name === 'string' && value.name.trim().length > 0
    && meals.some((meal) => meal === value.meal) && bases.some((basis) => basis === value.basis)
    && (value.catalogId === undefined || (typeof value.catalogId === 'number'
      && Number.isSafeInteger(value.catalogId) && value.catalogId > 0))
    && amount(value.amount, false) && validNutrients(value.values, true);
}

export function decodeCloudNutrition(row: unknown): CloudNutrition | null {
  if (!object(row) || typeof row.record_key !== 'string' || typeof row.version !== 'number'
    || !Number.isSafeInteger(row.version) || row.version < 1) return null;
  const key = row.record_key;
  const value = row.payload;
  if (key === goalsKey) {
    if (!object(value) || value.kind !== 'goals' || !validNutrients(value.values, false)) return null;
    return { key, version: row.version, value: { kind: 'goals', values: value.values } };
  }
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(key)) return null;
  if (value === null) return { key, version: row.version, value };
  if (!object(value) || value.kind !== 'food' || typeof value.day !== 'string'
    || !isDay(value.day) || value.day < '0001-01-01'
    || !validFood(value.food)) return null;
  return { key, version: row.version, value: { kind: 'food', day: value.day, food: value.food } };
}

export function visibleNutrition(workspace: NutritionWorkspace, day?: string): NutritionDay {
  const entries: FoodEntry[] = [];
  let goals: NutritionGoals | null = null;
  for (const { id, revision, value } of workspace.rows) {
    if (value?.kind === 'goals') goals = { version: revision, values: value.values };
    if (value?.kind === 'food' && (!day || value.day === day)) {
      entries.push({ ...value.food, id, version: revision, day: value.day });
    }
  }
  return { entries, goals };
}

function newRow(id: number, key: string, value: NutritionValue): AccountNutrition {
  return { id, key, revision: 0, baseVersion: null, value, pending: true, conflict: null };
}

function foodValue(day: string, { meal, name, basis, amount, values, catalogId }: Food): NutritionValue {
  return { kind: 'food', day, food: { meal, name, basis, amount, values, catalogId } };
}

export function copyDeviceNutrition(workspace: NutritionWorkspace, device: NutritionDay, newKey: () => string) {
  const sources = new Set(workspace.rows.map((row) => row.sourceId));
  let nextId = workspace.nextId;
  const rows: AccountNutrition[] = [];
  let copied = 0;
  for (const entry of device.entries) {
    if (sources.has(entry.id)) continue;
    sources.add(entry.id);
    rows.push({ ...newRow(nextId++, newKey(), foodValue(entry.day, entry)), sourceId: entry.id });
    copied++;
  }
  const copiedGoals = Boolean(device.goals && !workspace.rows.some((row) => row.key === goalsKey));
  if (copiedGoals && device.goals) {
    rows.push(newRow(nextId++, goalsKey, { kind: 'goals', values: device.goals.values }));
  }
  return { workspace: rows.length ? { nextId, rows: [...workspace.rows, ...rows] } : workspace, copied, copiedGoals };
}

export function editAccountNutrition(workspace: NutritionWorkspace, key: string, value: NutritionValue | null,
  expectedRevision?: number) {
  const current = workspace.rows.find((row) => row.key === key);
  if (current?.revision !== expectedRevision || current?.conflict || (!current && !value)) return null;
  if (!current && value) {
    return { nextId: workspace.nextId + 1, rows: [...workspace.rows, newRow(workspace.nextId, key, value)] };
  }
  if (!current) return null;
  return replace(workspace, { ...current, revision: current.revision + 1, value, pending: true });
}

function replace(workspace: NutritionWorkspace, row: AccountNutrition): NutritionWorkspace {
  return { ...workspace, rows: workspace.rows.map((current) => current.key === row.key ? row : current) };
}

function sameNutrients(a: Nutrients, b: Nutrients) {
  return nutrients.every((key) => a[key] === b[key]);
}

function sameValue(a: NutritionValue | null, b: NutritionValue | null) {
  if (!a || !b) return a === b;
  if (a.kind === 'goals' && b.kind === 'goals') return sameNutrients(a.values, b.values);
  return a.kind === 'food' && b.kind === 'food' && a.day === b.day
    && a.food.name === b.food.name && a.food.meal === b.food.meal
    && a.food.catalogId === b.food.catalogId
    && a.food.amount === b.food.amount && a.food.basis === b.food.basis && sameNutrients(a.food.values, b.food.values);
}

function adopted(current: AccountNutrition, incoming: CloudNutrition): AccountNutrition {
  return { ...current, revision: current.revision + 1, baseVersion: incoming.version, pending: false,
    value: incoming.value, conflict: null };
}

export function mergeCloudNutrition(workspace: NutritionWorkspace, incoming: CloudNutrition[]) {
  const rows = new Map(workspace.rows.map((row) => [row.key, row]));
  let nextId = workspace.nextId;
  let changed = false;
  for (const data of incoming) {
    const current = rows.get(data.key);
    if (!current) {
      rows.set(data.key, { id: nextId++, key: data.key, revision: 0, baseVersion: data.version,
        value: data.value, pending: false, conflict: null });
    } else if (data.version <= Math.max(current.baseVersion ?? 0, current.conflict?.version ?? 0)) {
      continue;
    } else if (!current.pending || sameValue(current.value, data.value)) {
      rows.set(data.key, adopted(current, data));
    } else {
      rows.set(data.key, { ...current, revision: current.revision + 1, conflict: data });
    }
    changed = true;
  }
  return changed ? { nextId, rows: [...rows.values()] } : workspace;
}

export function acknowledgeNutrition(workspace: NutritionWorkspace, sent: AccountNutrition, result: CloudNutrition) {
  const current = workspace.rows.find((row) => row.key === result.key);
  if (!current?.pending || current.baseVersion !== sent.baseVersion
    || result.version < (current.conflict?.version ?? 0)) return workspace;
  if (sameValue(current.value, result.value)) return replace(workspace, adopted(current, result));
  return replace(workspace, { ...current, baseVersion: result.version, conflict: null, revision: current.revision + 1 });
}

export function resolveNutritionConflict(workspace: NutritionWorkspace, row: AccountNutrition, useCloud: boolean) {
  const current = workspace.rows.find((entry) => entry.key === row.key);
  if (current?.revision !== row.revision || !current.conflict) return null;
  return replace(workspace, useCloud ? adopted(current, current.conflict) : {
    ...current, revision: current.revision + 1, baseVersion: current.conflict.version, conflict: null, pending: true,
  });
}

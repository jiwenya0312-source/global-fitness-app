import type { RecordedSet, WorkoutSession } from './workout-log';
import { isExerciseName } from './workout-plan';

export type ArchivedWorkout = Pick<WorkoutSession, 'startedAt' | 'units' | 'sets'> & {
  endedAt: string;
  schedule: Pick<WorkoutSession['schedule'], 'day'>;
};

export type CloudWorkout = { id: string; workout: ArchivedWorkout | null };
export type AccountWorkout = CloudWorkout & { sourceId?: number; pending: boolean };
export type WorkoutWorkspace = { rows: AccountWorkout[] };

export const emptyWorkoutWorkspace = (): WorkoutWorkspace => ({ rows: [] });

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function between(value: unknown, min: number, max: number) {
  return typeof value === 'number' && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number) {
  return Number.isInteger(value) && between(value, min, max);
}

function timestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function recordedSet(value: unknown): value is RecordedSet {
  return object(value) && isExerciseName(value.exercise)
    && (value.weightKg === null || between(value.weightKg, 0, 1000))
    && integer(value.reps, 1, 999) && (value.rir === null || integer(value.rir, 0, 10))
    && (value.seconds === undefined || integer(value.seconds, 1, 999))
    && (value.kind === undefined || value.kind === 'warmup')
    && (value.effort === undefined || ['effortLight', 'effortRight', 'effortHeavy'].some((item) => item === value.effort))
    && typeof value.notes === 'string' && value.notes.length <= 300;
}

function archivedWorkout(value: unknown): value is ArchivedWorkout {
  return object(value) && timestamp(value.startedAt) && timestamp(value.endedAt)
    && (value.units === 'metric' || value.units === 'imperial')
    && object(value.schedule) && integer(value.schedule.day, 1, 5)
    && Array.isArray(value.sets) && value.sets.every((sets) => Array.isArray(sets) && sets.every(recordedSet));
}

export function decodeCloudWorkout(row: unknown): CloudWorkout | null {
  if (!object(row) || typeof row.record_id !== 'string'
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(row.record_id)
    || (row.workout !== null && !archivedWorkout(row.workout))) return null;
  return { id: row.record_id, workout: row.workout };
}

export function copyFinishedWorkouts(workspace: WorkoutWorkspace, sessions: WorkoutSession[], newId: () => string) {
  const sources = new Set(workspace.rows.map((row) => row.sourceId));
  const added: AccountWorkout[] = [];
  for (const { id, startedAt, endedAt, units, schedule, sets } of sessions) {
    if (!endedAt || sources.has(id)) continue;
    sources.add(id);
    added.push({
      id: newId(), sourceId: id, pending: true,
      workout: { startedAt, endedAt, units, schedule: { day: schedule.day }, sets },
    });
  }
  return { workspace: added.length ? { rows: [...workspace.rows, ...added] } : workspace, copied: added.length };
}

export function removeAccountWorkout(workspace: WorkoutWorkspace, id: string): WorkoutWorkspace {
  if (!workspace.rows.some((row) => row.id === id && row.workout)) return workspace;
  return { rows: workspace.rows.map((row) =>
    row.id === id ? { ...row, workout: null, pending: true } : row) };
}

export function mergeCloudWorkouts(workspace: WorkoutWorkspace, records: CloudWorkout[], acknowledge = false) {
  const rows = new Map(workspace.rows.map((row) => [row.id, row]));
  let changed = false;
  for (const record of records) {
    const existing = rows.get(record.id);
    if (!existing || (record.workout === null && (existing.workout !== null || existing.pending))
      || (acknowledge && existing.pending && existing.workout !== null)) {
      rows.set(record.id, { ...existing, ...record, pending: false });
      changed = true;
    }
  }
  return changed ? { rows: [...rows.values()] } : workspace;
}

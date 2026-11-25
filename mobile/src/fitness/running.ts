import { dayDate, shiftDay } from './calendar';
import { readPreference, writePreference } from './quick-preferences';

export type RunTask = { day: string; minutes: number; checked: boolean };
export type RunDraft = { startedAt: number; resumedAt: number | null; elapsed: number; taskDay?: string; gps?: boolean };
export type RunEntry = { startedAt: number; endedAt: number; elapsed: number; km?: number; taskDay?: string; gps?: boolean; gpsDistance?: boolean };
export type RunningData = { tasks: RunTask[]; active: RunDraft | null; history: RunEntry[] };

const key = 'fitness.running.v1';
const empty: RunningData = { tasks: [], active: null, history: [] };

export async function readRunningData(): Promise<RunningData> {
  const raw = await readPreference(key);
  if (!raw) return empty;
  const data = JSON.parse(raw) as RunningData;
  if (!Array.isArray(data.tasks) || !Array.isArray(data.history)) throw new Error('Invalid running data');
  return data;
}

export function saveRunningData(data: RunningData) {
  return writePreference(key, JSON.stringify(data));
}

export function mondayOf(day: string) {
  return shiftDay(day, -((dayDate(day).getDay() + 6) % 7));
}

export function isRunDone(task: RunTask, history: RunEntry[]) {
  return task.checked || history.some((run) => run.taskDay === task.day);
}

export function elapsedRun(run: RunDraft, time: number) {
  return run.elapsed + (run.resumedAt === null ? 0 : Math.max(0, time - run.resumedAt));
}

export function durationText(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${remainder}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}`;
}

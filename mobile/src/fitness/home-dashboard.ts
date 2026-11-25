import { rawMeasurement, type BodyRecord, type MeasurementUnits } from './body-measurements';
import { readBodyRecords } from './body-store';
import { dayDate, localDay, shiftDay } from './calendar';
import type { NutritionDay } from './nutrition';
import { readNutritionDay } from './nutrition-store';
import type { ProfileRevision } from './profile';
import { readPlan, readProfile } from './profile-store';
import { newSession, type WorkoutLog, type WorkoutSession } from './workout-log';
import { planBlock, type PlanRevision, type WorkoutPlan } from './workout-plan';
import { makeUpWorkout } from './workout-schedule';
import { readWorkoutLog } from './workout-store';

type WorkoutDay = WorkoutPlan['sessions'][number];
type PlanBlock = NonNullable<ReturnType<typeof planBlock>>;

export type TodayTraining =
  | { state: 'active' | 'completed'; session: WorkoutSession }
  | { state: 'setup' | 'confirmPlan' }
  | { state: 'blocked'; reason: PlanBlock }
  | { state: 'scheduled'; session: WorkoutDay; makeup: boolean; preview: WorkoutSession; history: WorkoutSession[]; profile: ProfileRevision['profile']; done: number; total: number }
  | { state: 'rest'; nextDay: string };

type LatestMeasurement = { value: number; day: string };
type HomeBody = { weight: LatestMeasurement | null; waist: LatestMeasurement | null; units: MeasurementUnits };
type LoadResult<T> = { state: 'ready'; value: T } | { state: 'failed' };

export type HomeDay = {
  day: string;
  training: LoadResult<TodayTraining>;
  nutrition: LoadResult<NutritionDay>;
  body: LoadResult<HomeBody>;
};

export function todayTraining(day: string, profile: ProfileRevision | null, plan: PlanRevision | null,
  log: WorkoutLog): TodayTraining {
  if (log.active) return { state: 'active', session: log.active };

  const weekday = dayDate(day).getDay();
  const block = profile && planBlock(profile.profile);
  const accepted = plan && profile && !block && plan.profileSavedAt === profile.savedAt ? plan : null;
  const scheduled = accepted?.plan.sessions.find((session) => session.day === weekday);
  const completed = log.history.find((session) => session.endedAt &&
    (scheduled
      ? (session.planDay ?? localDay(new Date(session.endedAt))) === day
        && session.planSavedAt === accepted?.savedAt && session.schedule.day === scheduled.day
      : localDay(new Date(session.endedAt)) === day));
  if (completed) return { state: 'completed', session: completed };

  if (!profile) return { state: 'setup' };
  if (block) return { state: 'blocked', reason: block };
  if (!accepted || !accepted.plan.sessions.length) return { state: 'confirmPlan' };
  const next = scheduled ?? (accepted && makeUpWorkout(day, accepted, log.history));
  if (next && accepted) {
    const weekStart = shiftDay(day, -((weekday + 6) % 7));
    const completedDays = new Set(log.history.flatMap((item) => {
      if (!item.endedAt || item.planSavedAt !== accepted.savedAt) return [];
      const date = item.planDay ?? localDay(new Date(item.endedAt));
      return date >= weekStart && date <= day ? [date] : [];
    }));
    return { state: 'scheduled', session: next, makeup: !scheduled, profile: profile.profile, history: log.history,
      preview: { ...newSession(accepted, next.day, profile.profile.units, undefined, { mode: 'progressMode' }), id: 0 },
      done: completedDays.size, total: accepted.plan.sessions.length };
  }

  const nextOffset = Math.min(...accepted.plan.sessions.map((session) => (session.day - weekday + 7) % 7));
  return { state: 'rest', nextDay: shiftDay(day, nextOffset) };
}

export function latestMeasurements(records: BodyRecord[], day: string, units: MeasurementUnits): HomeBody {
  function latest(metric: 'weight' | 'waist') {
    for (const record of records) {
      if (record.day > day) continue;
      const value = rawMeasurement(record, metric);
      if (value !== null) return { day: record.day, value };
    }
    return null;
  }
  return { weight: latest('weight'), waist: latest('waist'), units };
}

function result<T>(promise: Promise<T>): Promise<LoadResult<T>> {
  return promise.then((value) => ({ state: 'ready', value }), () => ({ state: 'failed' }));
}

export async function readHomeDay(day: string): Promise<HomeDay> {
  const profile = readProfile();
  const [training, nutrition, body] = await Promise.all([
    result(Promise.all([profile, readPlan(), readWorkoutLog()]).then(([profileRevision, plan, log]) =>
      todayTraining(day, profileRevision, plan, log))),
    result(readNutritionDay(day)),
    result(Promise.all([profile.catch(() => null), readBodyRecords()]).then(([profileRevision, records]) =>
      latestMeasurements(records, day, profileRevision?.profile.units ?? 'metric'))),
  ]);
  return { day, training, nutrition, body };
}

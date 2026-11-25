import { rawMeasurement, type BodyRecord } from './body-measurements';
import { dayDate, dayNumber, localDay, shiftDay } from './calendar';
import { dailyTotals, type FoodEntry } from './nutrition';
import type { RecoveryReview } from './recovery';
import { countCheckOnly, countSets, equipmentReset, workingSets, workoutPersonalBests, type RecordedSet, type WorkoutSession } from './workout-log';
import { primaryMuscle } from './workout-schedule';
import type { Exercise, PlanRevision } from './workout-plan';

export const weeklyReportVersion = 1;

export function reportWeek(today: string, offset: number) {
  const start = shiftDay(today, -((dayDate(today).getDay() + 6) % 7) - offset * 7);
  const end = shiftDay(start, 6);
  const through = end < today ? end : today;
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
  const observedDays = days.filter((day) => day <= through);
  const previousStart = shiftDay(start, -7);
  const previousThrough = shiftDay(previousStart, observedDays.length - 1);
  return { start, end, through, days, observedDays, previousStart, previousThrough };
}

export type ReportWeek = ReturnType<typeof reportWeek>;

function dateOf(instant: string | null) {
  if (!instant) return null;
  const date = new Date(instant);
  return Number.isFinite(date.getTime()) ? localDay(date) : null;
}

function within(day: string | null, start: string, end: string) {
  return day !== null && day >= start && day <= end;
}

type Completed = { session: WorkoutSession; day: string; sets: number };
export type PerformanceMetric = 'load' | 'reps' | 'seconds';
export type PerformanceSeries = {
  exercise: Exercise;
  metric: PerformanceMetric;
  points: { day: string; value: number }[];
};

function performance(history: Completed[], week: ReportWeek) {
  const rows = new Map<Exercise, PerformanceSeries>();
  function bestOf(current: RecordedSet) {
    if (current.seconds !== undefined) return { metric: 'seconds', value: current.seconds } as const;
    if (current.weightKg !== null) return { metric: 'load', value: current.weightKg } as const;
    return { metric: 'reps', value: current.reps } as const;
  }
  for (const { session, day } of history) {
    if (day > week.through) break;
    const reset = new Set<Exercise>();
    session.sets.forEach((slot, position) => {
      for (const set of workingSets(slot)) {
        const exercise = set.exercise;
        if (equipmentReset(session, position, exercise)) reset.add(exercise);
      }
    });
    for (const exercise of reset) rows.delete(exercise);
    if (day < week.previousStart) continue;
    for (const slot of session.sets) {
      for (const set of workingSets(slot)) {
        const { exercise } = set;
        const { metric, value } = bestOf(set);
        const shape = rows.get(exercise);
        // A known external load is more comparable than reps with an unknown load.
        if (shape?.metric === 'load' && metric === 'reps') continue;
        const series = shape?.metric === metric ? shape : { exercise, metric, points: [] };
        const point = series.points.at(-1);
        if (point?.day === day) point.value = Math.max(value, point.value);
        else series.points.push({ day, value });
        rows.set(exercise, series);
      }
    }
  }
  return [...rows.values()].filter((series) => series.points.some(({ day }) => day >= week.start))
    .sort((a, b) => b.points.length - a.points.length || a.exercise.localeCompare(b.exercise));
}

export function summarizeTraining(history: WorkoutSession[], week: ReportWeek, plan: PlanRevision | null) {
  const completed = history.flatMap((session) => {
    const day = dateOf(session.endedAt);
    const sets = countSets(session);
    const checked = countCheckOnly(session);
    return day && sets + checked > 0 && day <= week.through ? [{ session, day, sets, checked }] : [];
  }).sort((a, b) => Date.parse(a.session.endedAt!) - Date.parse(b.session.endedAt!) || a.session.id - b.session.id);
  const current = completed.filter(({ day }) => within(day, week.start, week.through));
  const previous = completed.filter(({ day }) => within(day, week.previousStart, week.previousThrough));
  const bests = workoutPersonalBests(completed.map(({ session }) => session).reverse());

  const acceptedDay = dateOf(plan?.savedAt ?? null);
  const due = plan && acceptedDay ? plan.plan.sessions.filter(({ day }) => {
    const slot = shiftDay(week.start, day - 1);
    return slot >= acceptedDay && slot <= week.through;
  }) : [];
  const fulfilled = due.filter(({ day }) => current.some(({ session }) =>
    session.planSavedAt === plan?.savedAt && session.schedule.day === day
    && (!session.planDay || session.planDay === shiftDay(week.start, day - 1))));

  return {
    sessions: current.length,
    sets: current.reduce((total, entry) => total + entry.sets, 0),
    checked: current.reduce((total, entry) => total + entry.checked, 0),
    previousSets: previous.reduce((total, entry) => total + entry.sets, 0),
    hasPrevious: previous.length > 0,
    dailySets: week.days.map((day) => current.filter((entry) => entry.day === day).reduce((sum, entry) => sum + entry.sets, 0)),
    recordDays: [...new Set(current.filter(({ session }) => bests.has(session.id)).map(({ day }) => day))],
    planProgress: due.length ? { done: fulfilled.length, due: due.length } : null,
    series: performance(completed, week),
  };
}

export function summarizeFourWeeks(history: WorkoutSession[], today: string, plan: PlanRevision | null) {
  const start = shiftDay(today, -27);
  const range = { ...reportWeek(today, 0), start, through: today, previousStart: start };
  const completed = history.flatMap((session) => {
    const day = dateOf(session.endedAt);
    return day && within(day, start, today) && countSets(session) + countCheckOnly(session) > 0
      ? [{ session, day, sets: countSets(session) }] : [];
  }).sort((a, b) => a.day.localeCompare(b.day));
  const volume = new Map<string, number>();
  for (const { session } of completed) {
    for (const slot of session.sets) {
      for (const set of workingSets(slot)) {
        const muscle = primaryMuscle[set.exercise];
        volume.set(muscle, (volume.get(muscle) ?? 0) + 1);
      }
    }
  }
  let due = 0;
  let done = 0;
  const accepted = dateOf(plan?.savedAt ?? null);
  if (plan && accepted) for (let day = start; day <= today; day = shiftDay(day, 1)) {
    const weekday = (dayDate(day).getDay() + 6) % 7 + 1;
    if (day < accepted || !plan.plan.sessions.some((slot) => slot.day === weekday)) continue;
    due += 1;
    if (completed.some(({ session, day: recorded }) => session.planSavedAt === plan.savedAt
      && session.schedule.day === weekday && (session.planDay ?? recorded) === day)) done += 1;
  }
  return { start, through: today, sessions: completed.length, volume: [...volume], due, done,
    series: performance(completed, range).filter((entry) => entry.points.length > 1) };
}

export function summarizeNutrition(entries: FoodEntry[], week: ReportWeek) {
  const days = week.days.map((day) => {
    if (day > week.through) return null;
    const logged = entries.filter((entry) => entry.day === day);
    return logged.length ? dailyTotals(logged) : null;
  });
  const logged = days.filter((day): day is NonNullable<typeof day> => day !== null);
  const average = logged.length ? logged.reduce((sum, day) => ({
    kcal: sum.kcal + day.kcal / logged.length, protein: sum.protein + day.protein / logged.length,
  }), { kcal: 0, protein: 0 }) : null;
  return { days, loggedDays: logged.length, average };
}

export function summarizeMeasurements(records: BodyRecord[], week: ReportWeek) {
  return (['weight', 'waist'] as const).map((metric) => {
    const points = records.flatMap((record) => {
      const value = rawMeasurement(record, metric);
      return value === null || !within(record.day, week.start, week.through) ? [] : [{ day: record.day, value }];
    }).sort((a, b) => dayNumber(a.day) - dayNumber(b.day));
    const last = points.at(-1);
    return { metric, points: points.length, latest: last?.value ?? null,
      difference: points.length >= 2 && last ? last.value - points[0].value : null };
  });
}

export function latestWeeklyReview(reviews: RecoveryReview[], week: ReportWeek) {
  return reviews.filter((review) => within(dateOf(review.recordedAt), week.start, week.through))
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0] ?? null;
}

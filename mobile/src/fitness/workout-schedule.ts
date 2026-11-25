import { dayDate, localDay, shiftDay } from './calendar';
import type { WorkoutSession } from './workout-log';
import type { Exercise, PlanRevision } from './workout-plan';

export const primaryMuscle = {
  bodySquat: 'legs', gobletSquat: 'legs', legPress: 'legs', supportedSplitSquat: 'legs',
  gluteBridge: 'posterior', dumbbellHinge: 'posterior', legCurl: 'posterior',
  wallPushup: 'chest', floorPress: 'chest', chestPress: 'chest',
  proneW: 'back', dumbbellRow: 'back', seatedRow: 'back',
  deadBug: 'core', forearmPlank: 'core', dumbbellShoulderPress: 'shoulders', machineShoulderPress: 'shoulders',
} as const satisfies Record<Exercise, string>;

type PlannedDay = PlanRevision['plan']['sessions'][number];

export function makeUpWorkout(today: string, revision: PlanRevision, history: WorkoutSession[]) {
  const weekday = (dayDate(today).getDay() + 6) % 7 + 1;
  const sessions = revision.plan.sessions;
  if (sessions.some(({ day }) => day === weekday)) return undefined;
  const monday = shiftDay(today, 1 - weekday);
  const accepted = localDay(new Date(revision.savedAt));
  const endDay = (entry: WorkoutSession) => entry.endedAt ? localDay(new Date(entry.endedAt)) : '';
  if (history.some((entry) => endDay(entry) === today)) return undefined;
  const yesterday = shiftDay(today, -1);
  const adjacent = new Set(sessions.filter(({ day }) => day === weekday + 1)
    .flatMap(({ exercises }) => exercises.map(({ name }) => primaryMuscle[name])));
  for (const entry of history.filter((item) => endDay(item) === yesterday)) {
    entry.sets.forEach((sets, slot) => {
      for (const set of sets) if (set.kind !== 'warmup') adjacent.add(primaryMuscle[set.exercise]);
      if (entry.checkedSets?.[slot]?.length && entry.schedule.exercises[slot]) {
        adjacent.add(primaryMuscle[entry.selectedExercises?.[slot] ?? entry.schedule.exercises[slot].name]);
      }
    });
  }
  const compatible = (entry: PlannedDay) => entry.exercises.every(({ name }) =>
    primaryMuscle[name] === 'core' || !adjacent.has(primaryMuscle[name]));
  return sessions.find((entry) => {
    const due = shiftDay(monday, entry.day - 1);
    return due >= accepted && entry.day < weekday && compatible(entry) &&
      !history.some((record) => record.planSavedAt === revision.savedAt && record.schedule.day === entry.day &&
        (record.planDay ?? endDay(record)) === due);
  });
}

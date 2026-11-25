import { localDay } from './calendar';
import { displayMeasurement, parseDecimal, poundsToKg, type BodyProfile } from './profile';
import { exerciseRest, exerciseSeconds, type PlanRevision, type WorkoutPlan } from './workout-plan';

export const weekdays = ['planMonday', 'planTuesday', 'planWednesday', 'planThursday', 'planFriday'] as const;

type PlannedSession = WorkoutPlan['sessions'][number];
type Exercise = PlannedSession['exercises'][number]['name'];

export type RecordedSet = {
  exercise: Exercise;
  weightKg: number | null;
  reps: number;
  rir: number | null;
  notes: string;
  seconds?: number;
  effort?: SetEffort;
  kind?: 'warmup';
};
export type SetEffort = 'effortLight' | 'effortRight' | 'effortHeavy';
export type TrainingMode = 'steadyMode' | 'progressMode' | 'lightMode';

export type WorkoutSession = {
  id: number;
  version: number;
  endedAt: string | null;
  planSavedAt: string;
  startedAt: string;
  units: BodyProfile['units'];
  schedule: PlannedSession;
  minReps: number;
  maxReps: number;
  restSeconds: number;
  restUntil: number | null;
  sets: RecordedSet[][];
  mode?: TrainingMode;
  setUntil?: { movement: number; deadline: number; warmup?: boolean; targetSeconds?: number };
  differentEquipment?: number[];
  equipmentChanges?: Exercise[];
  selectedExercises?: Partial<Record<number, Exercise>>;
  planDay?: string;
  checklist?: boolean;
  stoppedForPain?: boolean;
  checkedSets?: number[][];
};

export type WorkoutLog = { active: WorkoutSession | null; history: WorkoutSession[] };

export function newSession(plan: PlanRevision, day: number, units: BodyProfile['units'], startedAt = new Date().toISOString(),
  options?: { planDay?: string; checklist?: boolean; mode?: TrainingMode; minutes?: number }) {
  const planned = plan.plan.sessions.find((session) => session.day === day);
  if (!planned) throw new Error('The selected training day is missing from the plan.');
  const schedule = planned.exercises.length && options?.minutes && options.minutes < planned.minutes
    ? shortenWorkout(planned, options.minutes, plan.plan.maxReps, plan.plan.warmupMinutes) : planned;
  return {
    mode: options?.mode,
    version: 0, endedAt: null, planSavedAt: plan.savedAt, startedAt, units,
    schedule, minReps: plan.plan.minReps, maxReps: plan.plan.maxReps,
    planDay: options?.planDay ?? localDay(new Date(startedAt)), checklist: options?.checklist,
    restSeconds: plan.plan.restSeconds, restUntil: null,
    sets: schedule.exercises.map((): RecordedSet[] => []),
  };
}

function shortenWorkout(schedule: PlannedSession, minutes: number, reps: number, warmup: number): PlannedSession {
  const cost = (exercise: Exercise) => ((exerciseSeconds(exercise) ?? reps * 4) + exerciseRest(exercise)) / 60;
  const sets = Math.max(1, Math.min(schedule.sets, Math.floor((minutes - warmup) / cost(schedule.exercises[0].name))));
  let estimate = warmup;
  const exercises: PlannedSession['exercises'] = [];
  for (const exercise of schedule.exercises) {
    const next = estimate + sets * cost(exercise.name);
    if (next > minutes) break;
    exercises.push(exercise);
    estimate = next;
  }
  return exercises.length ? { ...schedule, sets, exercises, minutes: Math.ceil(estimate) } : schedule;
}

export function workingSetTarget(session: WorkoutSession) {
  return session.mode === 'lightMode' ? Math.max(1, session.schedule.sets - 1) : session.schedule.sets;
}

export function nextWorkingMovement(session: WorkoutSession) {
  const target = workingSetTarget(session);
  return session.setUntil?.movement ?? session.sets.findIndex((sets, slot) => {
    const measured = workingSets(sets).length;
    return measured + (session.checkedSets?.[slot]?.filter((index) => index >= measured && index < target).length ?? 0) < target;
  });
}

export function countSets(session: Pick<WorkoutSession, 'sets'>) {
  return session.sets.reduce((count, sets) => count + workingSets(sets).length, 0);
}

export function countWarmupSets(session: Pick<WorkoutSession, 'sets'>) {
  return session.sets.reduce((count, sets) => count + sets.filter((set) => set.kind === 'warmup').length, 0);
}

export function countCheckOnly(session: Pick<WorkoutSession, 'sets' | 'checkedSets'>) {
  return session.sets.reduce((count, sets, slot) => count + (session.checkedSets?.[slot] ?? [])
    .filter((index) => index >= workingSets(sets).length).length, 0);
}

export function plannedGroupDone(session: Pick<WorkoutSession, 'sets' | 'checkedSets'>, slot: number, index: number) {
  return workingSets(session.sets[slot] ?? []).length > index || Boolean(session.checkedSets?.[slot]?.includes(index));
}

export function plannedWorkoutProgress(session: WorkoutSession) {
  const target = workingSetTarget(session);
  const done = session.schedule.exercises.reduce((count, _, slot) => {
    const recorded = Math.min(target, workingSets(session.sets[slot] ?? []).length);
    const checks = session.checkedSets?.[slot]?.filter((index) => index >= recorded && index < target).length ?? 0;
    return count + recorded + checks;
  }, 0);
  return { done, total: session.schedule.exercises.length * target };
}

export function hasWorkoutRecords(session: Pick<WorkoutSession, 'sets' | 'checkedSets'>) {
  return session.sets.some((sets) => sets.length > 0) || Boolean(session.checkedSets?.some((sets) => sets.length > 0));
}

export function workingSets(sets: RecordedSet[]) {
  return sets.filter((set) => set.kind !== 'warmup');
}

export function activeExercise(session: WorkoutSession, movement: number) {
  return session.selectedExercises?.[movement] ?? session.sets[movement].at(-1)?.exercise
    ?? session.schedule.exercises[movement].name;
}

const dumbbellStarts: Partial<Record<Exercise, number>> = {
  gobletSquat: 4, dumbbellHinge: 3, floorPress: 2, dumbbellRow: 3, dumbbellShoulderPress: 2,
};

export function equipmentReset(session: WorkoutSession, slot: number, exercise: Exercise) {
  return session.equipmentChanges?.includes(exercise)
    || (session.differentEquipment?.includes(slot) && activeExercise(session, slot) === exercise);
}

export function recommendSet(session: WorkoutSession, movement: number, history: WorkoutSession[], profile?: BodyProfile) {
  const exercise = activeExercise(session, movement);
  const last = workingSets(session.sets[movement]).findLast((set) => set.exercise === exercise);
  const reset = history.findIndex((workout) => workout.sets.some((sets, slot) =>
    equipmentReset(workout, slot, exercise) && workingSets(sets).some((set) => set.exercise === exercise)));
  const relevant = reset === -1 ? history : history.slice(0, reset + 1);
  const previous = (equipmentReset(session, movement, exercise) ? [] : relevant)
    .filter((workout) => workout.endedAt)
    .flatMap((workout) => {
      const slot = workout.sets.findIndex((sets, index) =>
        activeExercise(workout, index) === exercise &&
        (workingSets(sets).some((set) => set.exercise === exercise) || workout.checkedSets?.[index]?.length));
      if (slot < 0) return [];
      const sets = workingSets(workout.sets[slot]);
      return [{ workout, sets }];
    });
  const mode = session.mode ?? 'steadyMode';
  const matchedWorkout = previous.find(({ workout, sets }) => !workout.stoppedForPain && workout.mode !== 'lightMode' && sets.some((set) => set.exercise === exercise));
  const matched = matchedWorkout?.sets.findLast((set) => set.exercise === exercise);
  const start = dumbbellStarts[exercise];
  const step = session.units === 'metric' ? start ? 1 : 2.5 : (start ? 2.5 : 5) * poundsToKg;
  const lastDate = matchedWorkout?.workout.endedAt;
  const returning = Boolean(lastDate && Date.parse(session.startedAt) - Date.parse(lastDate) >= 21 * 86400000);
  const progress = !returning && previous.length >= 2 && previous.slice(0, 2).every(({ workout, sets }) =>
    workout.mode !== 'lightMode' && !workout.stoppedForPain && !workout.checklist && sets.length >= workingSetTarget(session) &&
    sets.length >= workingSetTarget(workout) && sets.every((set) =>
      set.exercise === exercise && set.weightKg === matched?.weightKg && set.reps >= session.maxReps &&
      (set.effort === 'effortLight' || (!set.effort && (set.rir ?? 0) >= 3))));
  const seconds = exerciseSeconds(exercise);
  let weightKg = last ? last.weightKg : matched ? matched.weightKg : start ?? null;
  let reps = last?.reps ?? Math.min(matched?.reps ?? session.minReps, session.maxReps);
  let reason: WorkoutReason = last ? 'workoutFromLastSet' : matched ? 'workoutFromHistory' : 'workoutTrial';
  if (last?.effort === 'effortHeavy') {
    if (weightKg !== null && start) weightKg = Math.max(0, weightKg - step);
    else reps = Math.max(1, reps - 1);
    reason = 'workoutAfterHeavy';
  } else if (!last && matched && (returning || mode === 'lightMode')) {
    if (weightKg !== null) weightKg = start ? Math.max(0, weightKg - step) : null;
    reps = Math.min(reps, session.minReps);
    reason = returning ? 'workoutAfterBreak' : 'workoutFromLightMode';
  } else if (!last && matched?.effort === 'effortHeavy') {
    if (weightKg !== null && start) weightKg = Math.max(0, weightKg - step);
    else reps = Math.max(1, reps - 1);
    reason = 'workoutAfterHeavy';
  } else if (!last && mode === 'progressMode' && progress && start && weightKg !== null && !seconds) {
    weightKg += step;
    reps = session.minReps;
    reason = 'workoutProgressReason';
  } else if (!last && !matched && start && profile && profile.experience !== 'beginner') {
    weightKg = start + step;
  }
  const value: RecordedSet = { exercise, weightKg, reps: seconds ? 1 : reps, rir: null, notes: '',
    ...(seconds ? { seconds: last?.seconds ?? (!returning && mode !== 'lightMode' ? matched?.seconds : undefined) ?? seconds } : {}) };
  return { value, matched, canProgress: progress && Boolean(start) && matched?.weightKg != null && !seconds, reason, step };
}

type WorkoutReason = 'workoutFromLastSet' | 'workoutFromHistory' | 'workoutTrial' | 'workoutAfterHeavy'
  | 'workoutAfterBreak' | 'workoutFromLightMode' | 'workoutProgressReason';

export function warmupSet(set: RecordedSet, step: number): RecordedSet {
  const lighter = set.weightKg === null ? null : Math.floor(set.weightKg / (2 * step)) * step;
  return {
    ...set, kind: 'warmup', weightKg: lighter, reps: set.seconds ? 1 : Math.min(6, set.reps),
    seconds: set.seconds ? Math.min(10, set.seconds) : undefined,
  };
}

export function workoutPersonalBests(history: WorkoutSession[]) {
  const results = new Set<number>();
  const previous = new Map<Exercise, { weight: number; count: number }>();
  for (const session of [...history].reverse()) {
    const updates = new Map<Exercise, { weight: number; count: number }>();
    session.sets.forEach((sets, movement) => {
      for (const set of workingSets(sets)) {
        if (equipmentReset(session, movement, set.exercise)) previous.delete(set.exercise);
        const current = { weight: set.weightKg ?? 0, count: set.seconds ?? set.reps };
        const latest = updates.get(set.exercise);
        if (!latest || current.weight > latest.weight || (current.weight === latest.weight && current.count > latest.count)) {
          updates.set(set.exercise, current);
        }
      }
    });
    for (const [exercise, current] of updates) {
      const latest = previous.get(exercise);
      if (!latest || current.weight > latest.weight || (current.weight === latest.weight && current.count > latest.count)) {
        if (latest) results.add(session.id);
        previous.set(exercise, current);
      }
    }
  }
  return results;
}

export function weightLabel(units: WorkoutSession['units']) {
  return units === 'metric' ? 'kg' : 'lb';
}

export function displaySetWeight(kg: number, units: WorkoutSession['units']) {
  return displayMeasurement(kg, units === 'metric' ? 1 : poundsToKg);
}

export function parseSet(exercise: Exercise, weight: string, repsInput: string,
  rirInput: string, notes: string, units: WorkoutSession['units']): RecordedSet | null {
  const weightKg = weight.trim() ? parseDecimal(weight) * (units === 'metric' ? 1 : poundsToKg) : null;
  const reps = parseDecimal(repsInput);
  const rir = rirInput.trim() ? parseDecimal(rirInput) : null;
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000)) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 999) return null;
  if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 10)) return null;
  return { exercise, weightKg, reps, rir, notes: notes.trim() };
}

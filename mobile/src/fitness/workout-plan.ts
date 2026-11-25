import type { BodyProfile, TrainingFocus } from './profile';

export const equipmentOptions = ['bodyweight', 'dumbbells', 'gymMachines'] as const;
export type PlanEquipment = typeof equipmentOptions[number];

const movements = {
  squat: ['bodySquat', 'gobletSquat', 'legPress'],
  hinge: ['gluteBridge', 'dumbbellHinge', 'legCurl'],
  step: ['supportedSplitSquat', 'supportedSplitSquat', 'legPress'],
  push: ['wallPushup', 'floorPress', 'chestPress'],
  pull: ['proneW', 'dumbbellRow', 'seatedRow'],
  core: ['deadBug', 'deadBug', 'deadBug'],
  shoulder: ['proneW', 'dumbbellShoulderPress', 'machineShoulderPress'],
  hold: ['forearmPlank', 'forearmPlank', 'forearmPlank'],
} as const;

type Movement = keyof typeof movements;
export type Exercise = typeof movements[Movement][number];
const exerciseNames = new Set<string>(Object.values(movements).flat());

export function isExerciseName(value: unknown): value is Exercise {
  return typeof value === 'string' && exerciseNames.has(value);
}

const equipmentIndex = { bodyweight: 0, dumbbells: 1, gymMachines: 2 } as const;

const fullA: readonly Movement[] = ['squat', 'push', 'pull', 'hinge', 'core'];
const fullB: readonly Movement[] = ['hinge', 'pull', 'push', 'step', 'core'];
const upper: readonly Movement[] = ['push', 'pull', 'core'];
const lower: readonly Movement[] = ['squat', 'hinge', 'core'];
const schedules = {
  1: [[1, fullA]],
  2: [[1, fullA], [4, fullB]],
  3: [[1, fullA], [3, fullB], [5, fullA]],
  4: [[1, upper], [2, lower], [4, upper], [5, lower]],
} as const;

export type PlanDays = keyof typeof schedules;

export type WorkoutPlan = {
  goal: BodyProfile['goal'];
  experience: BodyProfile['experience'];
  equipment: PlanEquipment;
  days: PlanDays;
  warmupMinutes: number;
  minReps: number;
  maxReps: number;
  rir: number;
  restSeconds: number;
  focus?: TrainingFocus;
  secondaryFocus?: TrainingFocus;
  sessions: {
    day: number;
    minutes: number;
    sets: number;
    exercises: { name: Exercise; alternative: Exercise | null }[];
    focus?: TrainingFocus;
  }[];
};

export type PlanRevision = {
  plan: WorkoutPlan;
  profileSavedAt: string;
  savedAt: string;
};

type PlanBlockReason = 'planAdultsOnly' | 'planLimitations' | 'planNeedsConsent' | 'planNeedsTime';

export function planBlock(profile: BodyProfile): PlanBlockReason | null {
  if (profile.age < 18) return 'planAdultsOnly';
  if (profile.limitations !== 'noLimitations') return 'planLimitations';
  if (!profile.allowSuggestions) return 'planNeedsConsent';
  if (profile.minutes < 10) return 'planNeedsTime';
  return null;
}

export function availablePlanDays(days: number) {
  const options: PlanDays[] = [1, 2, 3, 4];
  return options.filter((option) => option <= days);
}

export function availablePlanEquipment(venue: BodyProfile['venue']): readonly PlanEquipment[] {
  return venue === 'homeTraining' ? ['bodyweight', 'dumbbells'] : equipmentOptions;
}

const focusMovements = {
  balanced: [], shoulderFocus: ['shoulder', 'pull'], legFocus: ['squat', 'hinge', 'step'],
  coreFocus: ['hold', 'core'],
} as const satisfies Record<TrainingFocus, readonly Movement[]>;

export function exerciseRest(exercise: Exercise) {
  if (['legPress', 'chestPress', 'gobletSquat', 'dumbbellHinge', 'dumbbellShoulderPress',
    'machineShoulderPress', 'floorPress'].includes(exercise)) return 120;
  return ['deadBug', 'forearmPlank', 'proneW'].includes(exercise) ? 60 : 90;
}

export function exerciseSeconds(exercise: Exercise) {
  return exercise === 'forearmPlank' ? 20 : null;
}

export function buildPlan(profile: BodyProfile, days: PlanDays, equipment: PlanEquipment): WorkoutPlan | null {
  if (planBlock(profile) || !availablePlanDays(profile.days).includes(days) ||
      !availablePlanEquipment(profile.venue).includes(equipment)) return null;

  const warmupMinutes = 5;
  const restSeconds = 90;
  const rir = profile.experience === 'beginner' ? 4 : 3;
  const strength = profile.goal === 'gainStrength' && profile.experience !== 'beginner';
  const minReps = strength ? 6 : profile.goal === 'generalFitness' || profile.goal === 'loseFat' ? 10 : 8;
  const maxReps = strength ? 10 : profile.goal === 'loseFat' ? 15 : 12;
  const focus = profile.focus ?? 'balanced';
  const secondaryFocus = focus === 'balanced' || profile.secondaryFocus === focus
    ? 'balanced' : profile.secondaryFocus ?? 'balanced';
  const preferredSets = profile.experience === 'beginner' || profile.goal === 'generalFitness' ? 2 : 3;

  return {
    goal: profile.goal, experience: profile.experience, equipment, days, warmupMinutes, minReps, maxReps, rir, restSeconds,
    focus, secondaryFocus,
    sessions: schedules[days].map(([day, baseline], index) => {
      const dayFocus = index === 0 || index === 2 ? focus : index === 1 ? secondaryFocus : 'balanced';
      const extraPriority = days === 1 ? focusMovements[secondaryFocus].slice(0, 1) : [];
      const order = [...new Set<Movement>([...focusMovements[dayFocus].slice(0, 1), ...extraPriority, ...baseline,
        ...focusMovements[dayFocus].slice(1)])];
      const candidates = order.map((movement) => {
        const [fallback] = movements[movement];
        const name = movements[movement][equipmentIndex[equipment]];
        return { name, alternative: name === fallback ? null : fallback };
      }).filter((entry, position, entries) => entries.findIndex((other) => other.name === entry.name) === position);
      const cost = ({ name }: typeof candidates[number]) => ((exerciseSeconds(name) ?? maxReps * 4) + exerciseRest(name)) / 60;
      const budget = profile.minutes - warmupMinutes;
      const coreCost = candidates.slice(0, 3).reduce((sum, entry) => sum + cost(entry), 0);
      const sets = Math.max(1, Math.min(preferredSets, Math.floor(budget / coreCost)));
      let minutes = warmupMinutes;
      const exercises = candidates.filter((entry) => {
        const next = minutes + sets * cost(entry);
        if (next > profile.minutes) return false;
        minutes = next;
        return true;
      });
      return {
        day, sets, exercises, focus: dayFocus,
        minutes: Math.ceil(minutes),
      };
    }),
  };
}

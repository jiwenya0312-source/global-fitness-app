import type { ProfileRevision } from './profile';
import { countSets, workingSets, type WorkoutSession } from './workout-log';
import type { PlanRevision } from './workout-plan';

const hour = 60 * 60 * 1000;
const day = 24 * hour;

export type RecoveryFeedback = {
  sleep: 'rested' | 'fair' | 'poor';
  fatigue: 'low' | 'medium' | 'high';
  soreness: 'low' | 'medium' | 'high';
  concern: 'clear' | 'present' | 'unsure';
};

type Decision = 'pause' | 'delay' | 'reduce' | 'maintain' | 'increase';

export const recoveryResultCopy = {
  pause: ['recoveryPause', 'recoveryPauseDetail'],
  delay: ['recoveryDelay', 'recoveryDelayDetail'],
  reduce: ['recoveryReduce', 'recoveryReduceDetail'],
  maintain: ['recoveryMaintain', 'recoveryMaintainDetail'],
  increase: ['recoveryIncrease', 'recoveryIncreaseDetail'],
} as const satisfies Record<Decision, readonly [string, string]>;

type Reason =
  | 'recoveryReasonConcern' | 'recoveryReasonProfile' | 'recoveryReasonStrain'
  | 'recoveryReasonShortRest' | 'recoveryReasonSleep' | 'recoveryReasonModerate'
  | 'recoveryReasonVolume' | 'recoveryReasonHardSets' | 'recoveryReasonMissing'
  | 'recoveryReasonComparable' | 'recoveryReasonReady' | 'recoveryReasonStable' | 'recoveryReasonNoLoad';

export type RecoveryReview = {
  rulesVersion: 1;
  recordedAt: string;
  profileSavedAt: string;
  planSavedAt: string | null;
  feedback: RecoveryFeedback;
  decision: Decision;
  reason: Reason;
  latestWorkoutId: number | null;
  comparableWorkoutIds: number[];
  weeklyWorkoutIds: number[];
  previousWeekWorkoutIds: number[];
  restHours: number | null;
  weeklySets: number;
  previousWeekSets: number;
};

function sessionsByEnd(history: WorkoutSession[]) {
  return history.flatMap((session) => {
    const end = session.endedAt ? Date.parse(session.endedAt) : NaN;
    return Number.isFinite(end) ? [{ session, end }] : [];
  }).sort((left, right) => right.end - left.end || right.session.id - left.session.id);
}

function comparableSets(first: WorkoutSession, prior: WorkoutSession) {
  if (first.sets.length !== prior.sets.length) return false;
  return first.sets.every((recorded, index) => {
    const sets = workingSets(recorded);
    const previous = workingSets(prior.sets[index]);
    return sets.length === first.schedule.sets && previous.length === prior.schedule.sets &&
      sets.length === previous.length && sets.every((set, setIndex) => {
        const other = previous[setIndex];
        return set.exercise === other.exercise && set.weightKg === other.weightKg &&
          set.reps >= first.maxReps && other.reps >= prior.maxReps &&
          set.rir !== null && other.rir !== null && set.rir >= 3 && other.rir >= 3;
      });
  });
}

function decide(feedback: RecoveryFeedback, profileLimited: boolean, restHours: number | null,
  latest: WorkoutSession | undefined, comparison: WorkoutSession | undefined,
  weeklySets: number, previousWeekSets: number, previousWeekCount: number): [Decision, Reason] {
  if (feedback.concern !== 'clear') return ['pause', 'recoveryReasonConcern'];
  if (profileLimited) return ['pause', 'recoveryReasonProfile'];
  if (feedback.fatigue === 'high' || feedback.soreness === 'high') return ['delay', 'recoveryReasonStrain'];
  if (restHours !== null && restHours < 24) return ['delay', 'recoveryReasonShortRest'];
  if (feedback.sleep === 'poor') return ['reduce', 'recoveryReasonSleep'];
  if (feedback.fatigue === 'medium' || feedback.soreness === 'medium') return ['reduce', 'recoveryReasonModerate'];
  if (previousWeekCount >= 2 && weeklySets >= previousWeekSets + 4 && weeklySets > previousWeekSets * 1.5) {
    return ['reduce', 'recoveryReasonVolume'];
  }

  const sets = workingSets(latest?.sets.flat() ?? []);
  if (sets.some((set) => set.rir !== null && set.rir <= 1)) return ['reduce', 'recoveryReasonHardSets'];
  if (!latest || !comparison || restHours === null || sets.length === 0 || sets.some((set) => set.rir === null)) {
    return ['maintain', 'recoveryReasonMissing'];
  }
  if (!comparableSets(latest, comparison)) return ['maintain', 'recoveryReasonComparable'];
  if (feedback.sleep !== 'rested' || restHours < 48) return ['maintain', 'recoveryReasonStable'];
  if (!sets.some((set) => set.weightKg !== null && set.weightKg > 0)) return ['maintain', 'recoveryReasonNoLoad'];
  return ['increase', 'recoveryReasonReady'];
}

export function assessRecovery(feedback: RecoveryFeedback, profile: ProfileRevision, plan: PlanRevision | null,
  history: WorkoutSession[], observedAt: number): RecoveryReview {
  const logged = sessionsByEnd(history);
  const latest = logged[0];
  const relevant = logged.filter(({ end }) => end <= observedAt);
  const weekly = relevant.filter(({ end }) => end > observedAt - 7 * day);
  const previousWeek = relevant.filter(({ end }) => end <= observedAt - 7 * day && end > observedAt - 14 * day);
  const restHours = latest && latest.end <= observedAt ? Math.floor((observedAt - latest.end) / hour) : null;
  const forCurrentPlan = plan?.profileSavedAt === profile.savedAt ? plan : null;
  const reference = latest && restHours !== null && restHours < 7 * 24 &&
    forCurrentPlan && latest.session.planSavedAt === forCurrentPlan.savedAt ? latest.session : undefined;
  const comparison = reference ? relevant.find(({ session, end }) =>
    session.planSavedAt === reference.planSavedAt && session.schedule.day === reference.schedule.day &&
    latest.end - end >= day && end > observedAt - 21 * day)?.session : undefined;
  const weeklySets = weekly.reduce((total, { session }) => total + countSets(session), 0);
  const previousWeekSets = previousWeek.reduce((total, { session }) => total + countSets(session), 0);
  const [decision, reason] = decide(feedback, profile.profile.limitations !== 'noLimitations', restHours,
    reference, comparison, weeklySets, previousWeekSets, previousWeek.length);

  return {
    rulesVersion: 1, recordedAt: new Date(observedAt).toISOString(), profileSavedAt: profile.savedAt,
    planSavedAt: forCurrentPlan?.savedAt ?? null, feedback, decision, reason,
    latestWorkoutId: latest?.session.id ?? null, comparableWorkoutIds: [reference, comparison].flatMap((session) => session ? [session.id] : []),
    weeklyWorkoutIds: weekly.map(({ session }) => session.id),
    previousWeekWorkoutIds: previousWeek.map(({ session }) => session.id),
    restHours, weeklySets, previousWeekSets,
  };
}

export function isCurrentReview(review: RecoveryReview, profile: ProfileRevision, plan: PlanRevision | null,
  history: WorkoutSession[], now: number) {
  const age = now - Date.parse(review.recordedAt);
  const latest = sessionsByEnd(history)[0]?.session.id ?? null;
  const currentPlan = plan?.profileSavedAt === profile.savedAt ? plan : null;
  return age >= 0 && age < day && review.profileSavedAt === profile.savedAt &&
    review.planSavedAt === (currentPlan?.savedAt ?? null) && review.latestWorkoutId === latest;
}

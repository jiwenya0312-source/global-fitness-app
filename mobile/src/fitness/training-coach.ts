import { dayDate, localDay } from './calendar';
import { todayTraining } from './home-dashboard';
import { readNutritionEntriesBetween } from './nutrition-store';
import type { FoodEntry } from './nutrition';
import type { ProfileRevision } from './profile';
import { readPlan, readProfile } from './profile-store';
import { isCurrentReview, type RecoveryReview } from './recovery';
import { readRecovery } from './recovery-store';
import { reportWeek, summarizeNutrition, summarizeTraining } from './weekly-report';
import { newSession, nextWorkingMovement, recommendSet, type WorkoutLog, type WorkoutSession } from './workout-log';
import { planBlock, type PlanRevision } from './workout-plan';
import { readWorkoutLog } from './workout-store';

type CoachSources = {
  profile: ProfileRevision | null;
  plan: PlanRevision | null;
  log: WorkoutLog;
  food: FoodEntry[] | null;
  feedback: RecoveryReview | null;
  feedbackAvailable: boolean;
};

export function describeTraining(inputs: CoachSources, now: Date) {
  const { profile, plan, log, food, feedback, feedbackAvailable } = inputs;
  const today = localDay(now);
  const week = reportWeek(today, 0);
  const block = profile ? planBlock(profile.profile) : null;
  const accepted = profile && !block && plan?.profileSavedAt === profile.savedAt ? plan : null;
  const training = todayTraining(today, profile, plan, log);
  const currentReview = feedback && profile && profile.profile.age >= 18 && profile.profile.allowSuggestions
    && isCurrentReview(feedback, profile, plan, log.history, now.getTime()) ? feedback : null;
  const recoveryRestriction = currentReview && ['pause', 'delay', 'reduce'].includes(currentReview.decision);

  const nextDay = training.state === 'rest' ? training.nextDay : today;
  const schedule = training.state === 'scheduled' ? training.session : training.state === 'rest'
    ? accepted?.plan.sessions.find(({ day }) => day === dayDate(nextDay).getDay()) : undefined;
  const session: WorkoutSession | null = training.state === 'active' ? training.session
    : accepted && schedule && profile ? {
      id: 0, ...newSession(accepted, schedule.day, profile.profile.units,
        training.state === 'rest' ? dayDate(nextDay).toISOString() : now.toISOString()),
    } : null;
  const movement = session ? nextWorkingMovement(session) : -1;
  const recommendation = profile && !block && !recoveryRestriction && session && movement >= 0
    ? { suggestion: recommendSet(session, movement, log.history, profile.profile), units: session.units }
    : null;

  return {
    week, training, accepted, hasProfile: Boolean(profile), block, schedule, nextDay, currentReview, feedbackAvailable,
    recoveryRestriction: Boolean(recoveryRestriction), recommendation,
    trainingSummary: summarizeTraining(log.history, week, accepted),
    nutritionSummary: food ? summarizeNutrition(food, week) : null,
  };
}

export async function readTrainingCoach(now: Date) {
  const week = reportWeek(localDay(now), 0);
  const [profile, plan, log, food, feedback] = await Promise.all([
    readProfile(), readPlan(), readWorkoutLog(),
    readNutritionEntriesBetween(week.start, week.through).catch(() => null),
    readRecovery().then((value) => ({ value, available: true }), () => ({ value: null, available: false })),
  ]);
  return describeTraining({
    profile, plan, log, food, feedback: feedback.value, feedbackAvailable: feedback.available,
  }, now);
}

import type { BodyRecord } from './body-measurements';
import type { FoodEntry, NutritionGoals } from './nutrition';
import type { ProfileRevision } from './profile';
import type { ProgressPhoto } from './progress-photo';
import type { RecoveryReview } from './recovery';
import type { WorkoutSession } from './workout-log';
import type { PlanRevision } from './workout-plan';

export type DeviceFitnessData = {
  profiles: ProfileRevision[];
  plans: PlanRevision[];
  workouts: WorkoutSession[];
  recovery: RecoveryReview[];
  foodEntries: FoodEntry[];
  nutritionGoals: NutritionGoals | null;
  measurements: BodyRecord[];
  photoIndex: ProgressPhoto[];
};

import { randomUUID } from 'expo-crypto';

import {
  copyFinishedWorkouts, emptyWorkoutWorkspace, removeAccountWorkout, type WorkoutWorkspace,
} from './account-workout';
import { mutateAccountWorkspace } from './account-workspace';
import { readWorkspace } from './account-workspace-storage';
import { readWorkoutLog } from './workout-store';

export async function readAccountWorkouts(userId: string) {
  const { workspace } = await readWorkspace('workout', userId, emptyWorkoutWorkspace);
  return workspace;
}

export function mutateWorkoutWorkspace(userId: string, change: (workspace: WorkoutWorkspace) => WorkoutWorkspace) {
  return mutateAccountWorkspace('workout', userId, emptyWorkoutWorkspace, change);
}

export async function copyDeviceWorkouts(userId: string) {
  const { history } = await readWorkoutLog();
  let copied = 0;
  await mutateWorkoutWorkspace(userId, (workspace) => {
    const result = copyFinishedWorkouts(workspace, history, randomUUID);
    copied = result.copied;
    return result.workspace;
  });
  return copied;
}

export function deleteAccountWorkout(userId: string, id: string) {
  return mutateWorkoutWorkspace(userId, (workspace) => removeAccountWorkout(workspace, id));
}

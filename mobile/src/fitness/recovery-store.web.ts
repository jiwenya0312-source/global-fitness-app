import { openDatabase, planTable, profileTable, readLatest, recoveryTable, workoutTable } from './profile-store.web';
import type { ProfileRevision } from './profile';
import type { RecoveryReview } from './recovery';
import type { PlanRevision } from './workout-plan';

export function readRecovery() {
  return readLatest<RecoveryReview>(recoveryTable);
}

export async function readRecoveryHistory(): Promise<RecoveryReview[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(recoveryTable);
      const request = tx.objectStore(recoveryTable).getAll();
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve((request.result as RecoveryReview[]).reverse());
    });
  } finally {
    db.close();
  }
}

export async function saveRecovery(review: RecoveryReview) {
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction([profileTable, planTable, workoutTable, recoveryTable], 'readwrite');
      let written = false;
      tx.oncomplete = () => resolve(written);
      tx.onabort = () => reject(tx.error);
      const latest = tx.objectStore(profileTable).openCursor(null, 'prev');
      const plan = tx.objectStore(planTable).openCursor(null, 'prev');
      const workout = tx.objectStore(workoutTable).index('endedAt').openKeyCursor(null, 'prev');
      workout.onsuccess = () => {
        const profile: ProfileRevision | undefined = latest.result?.value;
        const confirmed: PlanRevision | undefined = plan.result?.value;
        const currentPlan = confirmed?.profileSavedAt === profile?.savedAt ? confirmed?.savedAt ?? null : null;
        if (profile?.savedAt !== review.profileSavedAt || currentPlan !== review.planSavedAt ||
            (workout.result?.primaryKey ?? null) !== review.latestWorkoutId) return;
        tx.objectStore(recoveryTable).add(review);
        written = true;
      };
    });
  } finally {
    db.close();
  }
}

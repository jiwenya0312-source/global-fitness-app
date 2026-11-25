import type { DeviceFitnessData } from './device-export-types';
import {
  bodyMeasurements, nutritionEntries, nutritionGoals, openDatabase, planTable, profileTable,
  progressPhotos, recoveryTable, workoutTable,
} from './profile-store.web';

export async function readDeviceFitnessData(): Promise<DeviceFitnessData> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([profileTable, planTable, workoutTable, recoveryTable,
        nutritionEntries, nutritionGoals, bodyMeasurements, progressPhotos]);
      const profiles = tx.objectStore(profileTable).getAll();
      const plans = tx.objectStore(planTable).getAll();
      const sessions = tx.objectStore(workoutTable).getAll();
      const recovery = tx.objectStore(recoveryTable).getAll();
      const food = tx.objectStore(nutritionEntries).getAll();
      const goals = tx.objectStore(nutritionGoals).get('daily');
      const measurements = tx.objectStore(bodyMeasurements).getAll();
      const photos = tx.objectStore(progressPhotos).getAll();
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve({
        profiles: profiles.result,
        plans: plans.result,
        workouts: sessions.result.map(({ active: _active, ...session }) => session),
        recovery: recovery.result,
        foodEntries: food.result,
        nutritionGoals: goals.result ?? null,
        measurements: measurements.result,
        photoIndex: photos.result,
      });
    });
  } finally {
    db.close();
  }
}

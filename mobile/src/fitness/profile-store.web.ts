import type { BodyProfile, ProfileRevision } from './profile';
import type { PlanRevision, WorkoutPlan } from './workout-plan';

export const profileTable = 'body_profiles';
export const planTable = 'workout_plans';
export const workoutTable = 'workout_sessions';
export const recoveryTable = 'recovery_reviews';
export const nutritionGoals = 'nutrition_goals';
export const nutritionEntries = 'nutrition_entries';
export const bodyMeasurements = 'body_measurements';
export const progressPhotos = 'progress_photos';
export const progressPhotoImages = 'progress_photo_images';
export const accountBodyWorkspaces = 'account_body_workspaces';
export const accountWorkoutWorkspaces = 'account_workout_workspaces';
export const accountNutritionWorkspaces = 'account_nutrition_workspaces';
export const nutritionMealTemplates = 'nutrition_meal_templates';

export function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('fitness', 11);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) request.result.createObjectStore(profileTable, { autoIncrement: true });
      if (event.oldVersion < 2) request.result.createObjectStore(planTable, { autoIncrement: true });
      if (event.oldVersion < 3) {
        const workouts = request.result.createObjectStore(workoutTable, { keyPath: 'id', autoIncrement: true });
        workouts.createIndex('active', 'active', { unique: true });
      }
      if (event.oldVersion < 4) {
        request.result.createObjectStore(recoveryTable, { autoIncrement: true });
        request.transaction?.objectStore(workoutTable).createIndex('endedAt', 'endedAt');
      }
      if (event.oldVersion < 5) {
        request.result.createObjectStore(nutritionGoals);
        const entries = request.result.createObjectStore(nutritionEntries, { keyPath: 'id', autoIncrement: true });
        entries.createIndex('day', 'day');
      }
      if (event.oldVersion < 6) {
        const records = request.result.createObjectStore(bodyMeasurements, { keyPath: 'id', autoIncrement: true });
        records.createIndex('day', 'day', { unique: true });
      }
      if (event.oldVersion < 7) {
        const photos = request.result.createObjectStore(progressPhotos, { keyPath: 'id', autoIncrement: true });
        photos.createIndex('slot', ['day', 'angle'], { unique: true });
        request.result.createObjectStore(progressPhotoImages);
      }
      if (event.oldVersion < 8) request.result.createObjectStore(accountBodyWorkspaces);
      if (event.oldVersion < 9) request.result.createObjectStore(accountWorkoutWorkspaces);
      if (event.oldVersion < 10) request.result.createObjectStore(accountNutritionWorkspaces);
      if (event.oldVersion < 11) request.result.createObjectStore(nutritionMealTemplates);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readLatest<T>(table: string): Promise<T | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const cursor = db.transaction(table).objectStore(table).openCursor(null, 'prev');
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => resolve(cursor.result?.value ?? null);
    });
  } finally {
    db.close();
  }
}

export function readProfile() {
  return readLatest<ProfileRevision>(profileTable);
}

export function readPlan() {
  return readLatest<PlanRevision>(planTable);
}

export async function saveProfile(profile: BodyProfile): Promise<ProfileRevision> {
  const revision = { profile, savedAt: new Date().toISOString() };
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(profileTable, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore(profileTable).add(revision);
    });
    return revision;
  } finally {
    db.close();
  }
}

export async function savePlan(plan: WorkoutPlan, profileSavedAt: string): Promise<PlanRevision | null> {
  const revision = { plan, profileSavedAt, savedAt: new Date().toISOString() };
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction([profileTable, planTable], 'readwrite');
      let inserted = false;
      transaction.oncomplete = () => resolve(inserted ? revision : null);
      transaction.onabort = () => reject(transaction.error);
      const latest = transaction.objectStore(profileTable).openCursor(null, 'prev');
      latest.onsuccess = () => {
        const profile: ProfileRevision | undefined = latest.result?.value;
        if (profile?.savedAt === profileSavedAt) {
          transaction.objectStore(planTable).add(revision);
          inserted = true;
        }
      };
    });
  } finally {
    db.close();
  }
}

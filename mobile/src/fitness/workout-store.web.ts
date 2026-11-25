import type { BodyProfile, ProfileRevision } from './profile';
import { openDatabase, profileTable, planTable, workoutTable } from './profile-store.web';
import { hasWorkoutRecords, newSession, type WorkoutLog, type WorkoutSession } from './workout-log';
import type { PlanRevision } from './workout-plan';

export async function readWorkoutLog(): Promise<WorkoutLog> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(workoutTable);
      const all = transaction.objectStore(workoutTable).getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const sessions = (all.result as WorkoutSession[]).reverse();
        resolve({
          active: sessions.find((session) => !session.endedAt) ?? null,
          history: sessions.filter((session) => session.endedAt),
        });
      };
    });
  } finally {
    db.close();
  }
}

export async function startWorkout(plan: PlanRevision, day: number, units: BodyProfile['units'],
  options?: Parameters<typeof newSession>[4]) {
  const draft = newSession(plan, day, units, undefined, options);
  const db = await openDatabase();
  try {
    return await new Promise<WorkoutSession | null>((resolve, reject) => {
      const tx = db.transaction([profileTable, planTable, workoutTable], 'readwrite');
      const workouts = tx.objectStore(workoutTable);
      let result: WorkoutSession | null = null;
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(result);
      const profile = tx.objectStore(profileTable).openCursor(null, 'prev');
      profile.onsuccess = () => {
        const latest: ProfileRevision | undefined = profile.result?.value;
        if (latest?.savedAt !== plan.profileSavedAt) return;
        const confirmed = tx.objectStore(planTable).openCursor(null, 'prev');
        confirmed.onsuccess = () => {
          const current: PlanRevision | undefined = confirmed.result?.value;
          if (current?.savedAt !== plan.savedAt) return;
          const active = workouts.index('active').get(1);
          active.onsuccess = () => {
            if (active.result) return;
            const request = workouts.add({ ...draft, active: 1 });
            request.onsuccess = () => { result = { ...draft, id: Number(request.result) }; };
          };
        };
      };
    });
  } finally {
    db.close();
  }
}

async function changeWorkout<T>(session: WorkoutSession,
  change: (workouts: IDBObjectStore) => T): Promise<T | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(workoutTable, 'readwrite');
      const workouts = tx.objectStore(workoutTable);
      let value: T | null = null;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
      const read = workouts.get(session.id);
      read.onsuccess = () => {
        const current: WorkoutSession | undefined = read.result;
        if (current?.version === session.version && !current.endedAt) value = change(workouts);
      };
    });
  } finally {
    db.close();
  }
}

export function updateWorkout(session: WorkoutSession) {
  const next = { ...session, version: session.version + 1 };
  return changeWorkout(session, (workouts) => {
    workouts.put({ ...next, active: next.endedAt ? undefined : 1 });
    return next;
  });
}

export async function discardEmptyWorkout(session: WorkoutSession) {
  if (hasWorkoutRecords(session)) return false;
  return await changeWorkout(session, (workouts) => {
    workouts.delete(session.id);
    return true;
  }) ?? false;
}

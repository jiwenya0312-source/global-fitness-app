import type { BodyRecord, Measurements } from './body-measurements';
import { bodyMeasurements, openDatabase } from './profile-store.web';

export async function readBodyRecords(): Promise<BodyRecord[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(bodyMeasurements);
      const request = tx.objectStore(bodyMeasurements).index('day').getAll();
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve((request.result as BodyRecord[]).reverse());
    });
  } finally {
    db.close();
  }
}

async function changeRecord(operation: (store: IDBObjectStore, applied: () => void) => void) {
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(bodyMeasurements, 'readwrite');
      let didWrite = false;
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve(didWrite);
      operation(tx.objectStore(bodyMeasurements), () => { didWrite = true; });
    });
  } finally {
    db.close();
  }
}

export function saveBodyRecord(day: string, values: Measurements, previous?: BodyRecord) {
  return changeRecord((store, applied) => {
    const sameDay = store.index('day').getKey(day);
    const record = { ...values, day, updatedAt: new Date().toISOString(), version: (previous?.version ?? -1) + 1 };
    sameDay.onsuccess = () => {
      if (sameDay.result !== undefined && sameDay.result !== previous?.id) return;
      if (!previous) {
        store.add(record);
        applied();
        return;
      }
      const old = store.get(previous.id);
      old.onsuccess = () => {
        const current: BodyRecord | undefined = old.result;
        if (current?.version !== previous.version) return;
        store.put({ ...record, id: previous.id });
        applied();
      };
    };
  });
}

export function deleteBodyRecord(record: BodyRecord) {
  return changeRecord((store, applied) => {
    const request = store.get(record.id);
    request.onsuccess = () => {
      const current: BodyRecord | undefined = request.result;
      if (current?.version !== record.version) return;
      store.delete(record.id);
      applied();
    };
  });
}

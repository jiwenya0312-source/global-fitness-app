import Storage from 'expo-sqlite/kv-store';

export function readPreference(key: string) {
  return Storage.getItem(key);
}

export function writePreference(key: string, value: string) {
  return Storage.setItem(key, value);
}

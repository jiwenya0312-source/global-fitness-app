import Storage from 'expo-sqlite/kv-store';

const key = 'fitness.language';

export function readLanguage() {
  return Storage.getItem(key);
}

export function writeLanguage(language: string) {
  return Storage.setItem(key, language);
}

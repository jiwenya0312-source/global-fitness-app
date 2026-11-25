export async function readPreference(key: string) {
  return window.localStorage.getItem(key);
}

export async function writePreference(key: string, value: string) {
  window.localStorage.setItem(key, value);
}

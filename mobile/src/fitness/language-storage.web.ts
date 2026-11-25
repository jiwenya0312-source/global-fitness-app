const key = 'fitness.language';

export async function readLanguage() {
  return window.localStorage.getItem(key);
}

export async function writeLanguage(language: string) {
  window.localStorage.setItem(key, language);
}

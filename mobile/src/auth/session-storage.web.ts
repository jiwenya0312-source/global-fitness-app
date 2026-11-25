export const sessionStorage = {
  getItem(key: string) {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value);
  },
  removeItem(key: string) {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(key);
  },
};

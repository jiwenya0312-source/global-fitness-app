export function authConfig(urlInput: string | undefined, keyInput: string | undefined, allowLoopback: boolean) {
  const url = urlInput?.trim();
  const key = keyInput?.trim();
  if (!url || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null;

  try {
    const parsed = new URL(url);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    const permitted = parsed.protocol === 'https:' || (allowLoopback && local && parsed.protocol === 'http:');
    if (!permitted || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      return null;
    }
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

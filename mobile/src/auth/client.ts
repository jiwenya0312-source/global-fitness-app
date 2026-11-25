import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { authConfig } from './config';
import { sessionStorage } from './session-storage';

const config = authConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  __DEV__,
);

export const accountEnabled = config !== null;
let client: SupabaseClient | undefined;

export function getAuthClient() {
  if (!config) return null;
  client ??= createClient(config.url, config.key, {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

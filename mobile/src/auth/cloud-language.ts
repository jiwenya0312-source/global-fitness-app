import type { Language } from '@/fitness/language';
import { checkCloudError, scopedCloudClient } from './cloud-client';

export type CloudLanguage = { language: Language | null; version: number; updated_at: string };

export async function readCloudLanguage(userId: string): Promise<CloudLanguage | null> {
  const { client, authorization } = await scopedCloudClient(userId);
  const { data, error } = await client.from('account_preferences')
    .select('language, version, updated_at')
    .eq('user_id', userId)
    .setHeader('Authorization', authorization)
    .maybeSingle<CloudLanguage>();
  checkCloudError(error);
  return data;
}

export async function writeCloudLanguage(userId: string, language: Language | null, expectedVersion: number | null) {
  const { client, authorization } = await scopedCloudClient(userId);
  const { data, error } = await client.rpc('write_account_language', {
    p_account: userId,
    p_language: language,
    p_expected_version: expectedVersion,
  }).setHeader('Authorization', authorization).maybeSingle<CloudLanguage>();
  checkCloudError(error);
  return data;
}

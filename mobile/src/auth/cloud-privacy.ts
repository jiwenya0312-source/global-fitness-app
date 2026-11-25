import { checkCloudError, CloudRequestError, scopedCloudClient } from './cloud-client';
import { getAuthClient } from './client';

export async function exportCloudAccount(userId: string) {
  const { client, authorization } = await scopedCloudClient(userId);
  const { data, error } = await client.rpc('export_fitness_account', { p_account: userId })
    .setHeader('Authorization', authorization);
  checkCloudError(error);
  if (!data || data.account?.id !== userId) throw new CloudRequestError('cloudAccountChanged');
  return data as Record<string, unknown>;
}

export async function sendDeletionCode(userId: string, email: string) {
  const { client } = await scopedCloudClient(userId);
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return !error;
}

export async function verifyDeletionCode(userId: string, email: string, token: string) {
  const { client } = await scopedCloudClient(userId);
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  return !error && data.session?.user.id === userId;
}

export async function deleteCloudAccount(userId: string) {
  const { client, authorization } = await scopedCloudClient(userId);
  const { data, error } = await client.rpc('delete_fitness_account', { p_account: userId })
    .setHeader('Authorization', authorization);
  checkCloudError(error);
  if (data !== true) throw new CloudRequestError('cloudConnectionError');
}

export async function signOutDeletedAccount(userId: string) {
  const client = getAuthClient();
  if (!client) return true;
  const { data, error } = await client.auth.getSession();
  if (error) return false;
  if (data.session?.user.id !== userId) return true;
  const result = await client.auth.signOut({ scope: 'local' });
  return !result.error;
}

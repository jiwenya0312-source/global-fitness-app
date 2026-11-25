import { getAuthClient } from './client';

export type CloudError = 'cloudConnectionError' | 'cloudSchemaMissing' | 'cloudAccountChanged';

export class CloudRequestError extends Error {
  constructor(readonly label: CloudError) {
    super(label);
  }
}

export async function scopedCloudClient(userId: string) {
  const client = getAuthClient();
  if (!client) throw new CloudRequestError('cloudAccountChanged');
  const { data, error } = await client.auth.getSession();
  if (error) throw new CloudRequestError('cloudConnectionError');
  if (data.session?.user.id !== userId) throw new CloudRequestError('cloudAccountChanged');
  return { client, authorization: `Bearer ${data.session.access_token}` };
}

export function checkCloudError(error: { code: string } | null) {
  if (!error) return;
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code)) {
    throw new CloudRequestError('cloudSchemaMissing');
  }
  if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303') {
    throw new CloudRequestError('cloudAccountChanged');
  }
  throw new CloudRequestError('cloudConnectionError');
}

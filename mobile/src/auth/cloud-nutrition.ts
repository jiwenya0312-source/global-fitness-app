import { acknowledgeNutrition, decodeCloudNutrition, mergeCloudNutrition } from '@/fitness/account-nutrition';
import { mutateNutritionWorkspace, readNutritionWorkspace } from '@/fitness/account-nutrition-store';

import { checkCloudError, CloudRequestError, scopedCloudClient } from './cloud-client';

const pageSize = 100;

function decode(row: unknown) {
  const record = decodeCloudNutrition(row);
  if (!record) throw new CloudRequestError('cloudConnectionError');
  return record;
}

async function pullNutrition(userId: string) {
  let after: string | undefined;
  for (;;) {
    const { client, authorization } = await scopedCloudClient(userId);
    const query = client.from('account_nutrition').select('record_key, version, payload')
      .eq('user_id', userId).order('record_key').limit(pageSize).setHeader('Authorization', authorization);
    if (after) query.gt('record_key', after);
    const { data, error } = await query;
    checkCloudError(error);
    const records = (data ?? []).map(decode);
    if (records.length) {
      await mutateNutritionWorkspace(userId, (workspace) => mergeCloudNutrition(workspace, records));
    }
    if (records.length < pageSize) return;
    after = records.at(-1)?.key;
  }
}

export async function syncAccountNutrition(userId: string) {
  const { rows } = await readNutritionWorkspace(userId);
  const queued = rows.filter((row) => row.pending && !row.conflict);
  await pullNutrition(userId);

  let pullAgain = false;
  for (const row of queued) {
    const { rows: currentRows } = await readNutritionWorkspace(userId);
    const current = currentRows.find((entry) => entry.key === row.key);
    if (!current?.pending || current.conflict || current.revision !== row.revision) continue;
    const { client, authorization } = await scopedCloudClient(userId);
    const { data, error } = await client.rpc('write_account_nutrition', {
      p_account: userId, p_key: row.key, p_version: row.baseVersion, p_payload: row.value,
    }).setHeader('Authorization', authorization).maybeSingle();
    checkCloudError(error);
    if (data === null) {
      pullAgain = true;
      continue;
    }
    const result = decode(data);
    if (result.key !== row.key) throw new CloudRequestError('cloudConnectionError');
    await mutateNutritionWorkspace(userId, (workspace) => acknowledgeNutrition(workspace, row, result));
  }
  if (pullAgain) await pullNutrition(userId);
}

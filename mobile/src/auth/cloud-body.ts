import {
  acknowledgeCloudWrite, emptyBodyWorkspace, mergeCloudRecords, type AccountBodyRecord, type CloudBodyRecord,
} from '@/fitness/account-body';
import { mutateWorkspace } from '@/fitness/account-body-store';
import { readWorkspace } from '@/fitness/account-workspace-storage';
import { checkCloudError, scopedCloudClient } from './cloud-client';

type CloudRow = {
  day: string;
  weight_kg: number | null;
  waist_cm: number | null;
  deleted: boolean;
  version: number;
  updated_at: string;
};

function toRecord(row: CloudRow): CloudBodyRecord {
  return {
    day: row.day, weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    waistCm: row.waist_cm === null ? null : Number(row.waist_cm),
    deleted: row.deleted, version: row.version, updatedAt: row.updated_at,
  };
}

async function readCloudBody(userId: string) {
  const records: CloudBodyRecord[] = [];
  let after: string | undefined;
  const pageSize = 200;
  for (;;) {
    const { client, authorization } = await scopedCloudClient(userId);
    let request = client.from('account_body_measurements')
      .select('day,weight_kg,waist_cm,deleted,version,updated_at')
      .eq('user_id', userId).order('day').limit(pageSize).setHeader('Authorization', authorization);
    if (after) request = request.gt('day', after);
    const { data, error } = await request.returns<CloudRow[]>();
    checkCloudError(error);
    const page = data ?? [];
    records.push(...page.map(toRecord));
    if (page.length < pageSize) return records;
    after = page[page.length - 1].day;
  }
}

async function writeCloudBody(userId: string, record: AccountBodyRecord) {
  const { client, authorization } = await scopedCloudClient(userId);
  const { data, error } = await client.rpc('write_account_body_measurement', {
    p_account: userId,
    p_day: record.day,
    p_expected_version: record.cloudVersion,
    p_weight_kg: record.weightKg,
    p_waist_cm: record.waistCm,
    p_deleted: record.deleted,
  }).setHeader('Authorization', authorization).maybeSingle<CloudRow>();
  checkCloudError(error);
  return data ? toRecord(data) : null;
}

export async function syncAccountMeasurements(userId: string) {
  async function pull() {
    const incoming = await readCloudBody(userId);
    return mutateWorkspace(userId, (workspace) => mergeCloudRecords(workspace, incoming));
  }

  const initial = await pull();
  if (!initial) return;
  let retryPull = false;
  for (const entry of initial.rows) {
    if (!entry.dirty || entry.conflict) continue;
    const { workspace } = await readWorkspace('body', userId, emptyBodyWorkspace);
    const current = workspace.rows.find((row) => row.id === entry.id);
    if (current?.version !== entry.version) continue;
    const written = await writeCloudBody(userId, entry);
    if (written) {
      await mutateWorkspace(userId, (workspace) => acknowledgeCloudWrite(workspace, entry, written));
    } else {
      retryPull = true;
    }
  }
  if (retryPull) await pull();
}

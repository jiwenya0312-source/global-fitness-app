import { decodeCloudWorkout, mergeCloudWorkouts } from '@/fitness/account-workout';
import { mutateWorkoutWorkspace, readAccountWorkouts } from '@/fitness/account-workout-store';

import { checkCloudError, CloudRequestError, scopedCloudClient } from './cloud-client';

const pageSize = 50;

function decode(row: unknown) {
  const record = decodeCloudWorkout(row);
  if (!record) throw new CloudRequestError('cloudConnectionError');
  return record;
}

export async function syncAccountWorkouts(userId: string) {
  const { rows } = await readAccountWorkouts(userId);
  const pending = rows.filter((record) => record.pending);
  let after: string | undefined;
  while (true) {
    const { client, authorization } = await scopedCloudClient(userId);
    const query = client.from('account_workout_history').select('record_id, workout')
      .eq('user_id', userId).order('record_id').limit(pageSize).setHeader('Authorization', authorization);
    if (after) query.gt('record_id', after);
    const { data, error } = await query;
    checkCloudError(error);
    const records = (data ?? []).map(decode);
    if (records.length) {
      await mutateWorkoutWorkspace(userId, (workspace) => mergeCloudWorkouts(workspace, records));
    }
    if (records.length < pageSize) break;
    after = records.at(-1)?.id;
  }

  for (const row of pending) {
    const current = (await readAccountWorkouts(userId)).rows.find((record) => record.id === row.id);
    if (!current?.pending || (current.workout === null) !== (row.workout === null)) continue;
    const { client, authorization } = await scopedCloudClient(userId);
    const { data, error } = await client.rpc('write_account_workout', {
      p_account: userId, p_record: current.id, p_workout: current.workout,
    }).setHeader('Authorization', authorization).maybeSingle();
    checkCloudError(error);
    const saved = decode(data);
    if (saved.id !== row.id) throw new CloudRequestError('cloudConnectionError');
    await mutateWorkoutWorkspace(userId, (workspace) => mergeCloudWorkouts(workspace, [saved], true));
  }
}

import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Language } from '@/fitness/language';

import { scopedCloudClient } from './cloud-client';

export type CoachContext = {
  plan?: { focus: string; equipment: string; days: number; exercises: string[] };
  load?: { exercise: string; suggestion: string; reason: string; lastSet: string | null };
  week?: { start: string; through: string; workouts: number; sets: number; foodDays: number | null };
};

export type CoachQuestion = { language: Language; question: string; context: CoachContext };
export type CoachErrorLabel = 'cloudCoachUnavailable' | 'cloudCoachRate' | 'cloudCoachScope' | 'cloudCoachSignIn';

export class CoachRequestError extends Error {
  constructor(readonly label: CoachErrorLabel) {
    super(label);
  }
}

export async function askCloudCoach(userId: string, question: CoachQuestion, signal: AbortSignal) {
  const { client, authorization } = await scopedCloudClient(userId);
  if (signal.aborted) throw new CoachRequestError('cloudCoachUnavailable');
  const { data, error } = await client.functions.invoke<{ answer: string }>('fitness-coach', {
    body: { ...question, account: userId },
    headers: { Authorization: authorization },
    signal,
    timeout: 27_000,
  });
  if (error instanceof FunctionsHttpError) {
    const status = (error.context as Response).status;
    if (status === 429) throw new CoachRequestError('cloudCoachRate');
    if (status === 422) throw new CoachRequestError('cloudCoachScope');
    if (status === 401 || status === 403) throw new CoachRequestError('cloudCoachSignIn');
  }
  if (error || typeof data?.answer !== 'string' || !data.answer.trim() || data.answer.length > 2_500) {
    throw new CoachRequestError('cloudCoachUnavailable');
  }
  return data.answer.trim();
}

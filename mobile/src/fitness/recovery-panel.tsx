import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useLanguage } from './language';
import type { ProfileRevision } from './profile';
import { assessRecovery, isCurrentReview, recoveryResultCopy, type RecoveryFeedback, type RecoveryReview } from './recovery';
import { readRecovery, saveRecovery } from './recovery-store';
import { Action, Card, Choice, styles } from './ui';
import type { WorkoutSession } from './workout-log';
import type { PlanRevision } from './workout-plan';

const levels = ['low', 'medium', 'high'] as const;
const questions = {
  sleep: ['rested', 'fair', 'poor'],
  fatigue: levels,
  soreness: levels,
  concern: ['clear', 'present', 'unsure'],
} as const;

export function RecoveryPanel({ profile, plan, history, openInitially }: {
  profile: ProfileRevision;
  plan: PlanRevision | null;
  history: WorkoutSession[];
  openInitially?: boolean;
}) {
  const allowed = profile.profile.age >= 18 && profile.profile.allowSuggestions;
  return allowed ? <RecoveryReviewCard profile={profile} plan={plan} history={history} openInitially={openInitially} /> : null;
}

function RecoveryReviewCard({ profile, plan, history, openInitially }: {
  profile: ProfileRevision;
  plan: PlanRevision | null;
  history: WorkoutSession[];
  openInitially?: boolean;
}) {
  const { t } = useLanguage();
  const [review, setReview] = useState<RecoveryReview | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [now, setNow] = useState(Date.now);
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState<Partial<RecoveryFeedback> | null>(() => openInitially ? {} : null);
  const [status, setStatus] = useState<'saving' | 'invalid' | 'failed' | 'stale'>();
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    readRecovery().then((saved) => {
      if (!active) return;
      setNow(Date.now());
      setReview(saved);
      setLoadState('ready');
    }, () => {
      if (active) setLoadState('failed');
    });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (!review) return;
    const delay = 24 * 60 * 60 * 1000 - (Date.now() - Date.parse(review.recordedAt));
    if (delay <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), delay + 1);
    return () => clearTimeout(timer);
  }, [review]);

  const current = review && isCurrentReview(review, profile, plan, history, now) ? review : null;
  const currentResult = current ? recoveryResultCopy[current.decision] : null;

  function choose<K extends keyof RecoveryFeedback>(key: K, value: RecoveryFeedback[K]) {
    setFeedback((old) => ({ ...old, [key]: value }));
    if (status === 'invalid') setStatus(undefined);
  }

  async function submit() {
    if (pending.current || status === 'stale') return;
    const { sleep, fatigue, soreness, concern } = feedback ?? {};
    if (!sleep || !fatigue || !soreness || !concern) {
      setStatus('invalid');
      return;
    }
    const next = assessRecovery({ sleep, fatigue, soreness, concern }, profile, plan, history, Date.now());
    pending.current = true;
    setStatus('saving');
    try {
      if (!(await saveRecovery(next))) {
        setStatus('stale');
        return;
      }
      setNow(Date.now());
      setReview(next);
      setFeedback(null);
      setStatus(undefined);
    } catch {
      setStatus('failed');
    } finally {
      pending.current = false;
    }
  }

  function question<K extends keyof RecoveryFeedback>(key: K, label: string,
    options: readonly RecoveryFeedback[K][]) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.body}>{label}</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {options.map((option) => (
            <Choice key={option} label={t[`recovery_${option}`]}
              selected={feedback?.[key] === option} disabled={status === 'saving' || status === 'stale'}
              onPress={() => choose(key, option)} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <Card title={t.recoveryTitle} icon="recovery">
      {loadState === 'loading' && <Text style={styles.secondary}>{t.recoveryLoading}</Text>}
      {loadState === 'failed' && (
        <>
          <Text accessibilityRole="alert" style={styles.secondary}>{t.recoveryLoadFailed}</Text>
          <Action label={t.retry} onPress={() => {
            setLoadState('loading');
            setAttempt((value) => value + 1);
          }} />
        </>
      )}
      {loadState === 'ready' && (feedback ? (
        <>
          {question('sleep', t.recoverySleep, questions.sleep)}
          {question('fatigue', t.recoveryFatigue, questions.fatigue)}
          {question('soreness', t.recoverySoreness, questions.soreness)}
          {question('concern', t.recoveryConcern, questions.concern)}
          {status && status !== 'saving' && (
            <Text accessibilityRole="alert" style={styles.secondary}>
              {t[status === 'invalid' ? 'recoveryRequired' : status === 'stale' ? 'recoveryStale' : 'recoverySaveFailed']}
            </Text>
          )}
          {status === 'saving' ? <Text style={styles.secondary}>{t.profileSaving}</Text> : (
            <View style={styles.row}>
              {status !== 'stale' && <Action label={t.recoverySubmit} onPress={() => { void submit(); }} />}
              <Action label={t.profileCancel} onPress={() => { setFeedback(null); setStatus(undefined); }} />
            </View>
          )}
        </>
      ) : (
        <>
          {current && currentResult ? (
            <>
              <Text accessibilityRole="header" style={styles.headline}>{t[currentResult[0]]}</Text>
              <Text style={styles.body}>{t[currentResult[1]]}</Text>
              <Text style={styles.secondary}>{t[current.reason]}</Text>
              <Text style={styles.secondary}>{current.restHours === null
                ? t.recoveryRestUnknown : `${t.recoveryRest} · ${current.restHours} ${t.recoveryHours}`}</Text>
              <Text style={styles.secondary}>{t.recovery7Days} · {current.weeklySets} {t.sets}</Text>
              {current.previousWeekWorkoutIds.length > 0 && (
                <Text style={styles.secondary}>{t.recoveryPrevious7Days} · {current.previousWeekSets} {t.sets}</Text>
              )}
            </>
          ) : <Text style={styles.secondary}>{t[review ? 'recoveryExpired' : 'recoveryIntro']}</Text>}
          <Action label={t[current ? 'recoveryRepeat' : 'recoveryOpen']}
            onPress={() => { setStatus(undefined); setFeedback({}); }} />
        </>
      ))}
    </Card>
  );
}

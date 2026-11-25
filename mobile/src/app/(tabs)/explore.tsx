import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useAccount } from '@/auth/account-provider';
import { AccountWorkoutScreen } from '@/fitness/account-workout-screen';
import { localDay, shiftDay } from '@/fitness/calendar';
import { useLanguage } from '@/fitness/language';
import { PlanEditor, PlanSchedule } from '@/fitness/plan-panel';
import type { ProfileRevision } from '@/fitness/profile';
import { readPlan, readProfile } from '@/fitness/profile-store';
import { RecoveryPanel } from '@/fitness/recovery-panel';
import { mondayOf } from '@/fitness/running';
import { RunWeek } from '@/fitness/running-ui';
import { Action, Card, Choice, Page, SecondaryButton, styles } from '@/fitness/ui';
import { WorkoutCheckIn, WorkoutTargets } from '@/fitness/workout-check-in';
import { WorkoutChecklist } from '@/fitness/workout-checklist';
import { countCheckOnly, countSets, countWarmupSets, newSession, plannedWorkoutProgress, weekdays, workoutPersonalBests, type TrainingMode, type WorkoutLog, type WorkoutSession } from '@/fitness/workout-log';
import { planBlock, type PlanRevision } from '@/fitness/workout-plan';
import { makeUpWorkout } from '@/fitness/workout-schedule';
import { ActiveWorkout, WorkoutHistory } from '@/fitness/workout-session';
import { readWorkoutLog, startWorkout, updateWorkout } from '@/fitness/workout-store';

type WorkoutState =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; profile: ProfileRevision | null; plan: PlanRevision | null; log: WorkoutLog };

export default function Workout() {
  const { state } = useAccount();
  const [opened, setOpened] = useState<string>();
  const accountId = state.status === 'signedIn' ? state.userId : undefined;
  if (accountId && opened === accountId) {
    return <AccountWorkoutScreen key={accountId} userId={accountId} close={() => setOpened(undefined)} />;
  }
  return <DeviceWorkout openAccount={accountId ? () => setOpened(accountId) : undefined} />;
}

function DeviceWorkout({ openAccount }: { openAccount?: () => void }) {
  const router = useRouter();
  const { preview, todayWorkout } = useLocalSearchParams<{ preview?: string; todayWorkout?: string }>();
  const { language, t } = useLanguage();
  const [state, setState] = useState<WorkoutState>({ status: 'loading' });
  const request = useRef(0);
  const [editingProfile, setEditingProfile] = useState<string>();
  const [showSaved, setShowSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const [checkIn, setCheckIn] = useState<{ day: number; checklist: boolean }>();
  const [startFailed, setStartFailed] = useState(false);
  const startPending = useRef(false);
  const [section, setSection] = useState<'plan' | 'history'>('plan');
  const [finishedId, setFinishedId] = useState<number>();
  const [showRecovery, setShowRecovery] = useState(false);
  const today = localDay();
  const monday = mondayOf(today);

  const load = useCallback(() => {
    const id = ++request.current;
    setState({ status: 'loading' });
    Promise.all([readProfile(), readPlan(), readWorkoutLog()]).then(([profile, plan, log]) => {
      if (id === request.current) setState({ status: 'ready', profile, plan, log });
    }, () => {
      if (id === request.current) setState({ status: 'failed' });
    });
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    return () => { request.current += 1; };
  }, [load]));

  function reload() {
    setEditingProfile(undefined);
    setShowSaved(false);
    load();
  }

  function editPlan(profile: ProfileRevision) {
    setShowSaved(false);
    setEditingProfile(profile.savedAt);
  }

  async function start(plan: PlanRevision, profile: ProfileRevision, day: number, checklist: boolean, mode: TrainingMode, minutes?: number) {
    if (startPending.current) return;
    startPending.current = true;
    setStarting(true);
    setStartFailed(false);
    const loadVersion = request.current;
    try {
      const active = await startWorkout(plan, day, profile.profile.units, { planDay: shiftDay(monday, day - 1), checklist, mode, minutes });
      if (loadVersion !== request.current) return;
      if (!active) {
        reload();
        return;
      }
      setState((current) => current.status === 'ready'
        ? { ...current, log: { ...current.log, active } } : current);
      setCheckIn(undefined);
      if (todayWorkout) router.setParams({ todayWorkout: '' });
      setFinishedId(undefined);
      setShowRecovery(false);
    } catch {
      setStartFailed(true);
    } finally {
      startPending.current = false;
      setStarting(false);
    }
  }

  function updateLog(previous: WorkoutSession, next: WorkoutSession | null) {
    if (next?.endedAt) {
      setFinishedId(next.id);
      setShowRecovery(false);
    }
    setState((current) => {
      if (current.status !== 'ready' || current.log.active?.id !== previous.id) return current;
      const ended = next?.endedAt ? next : null;
      return { ...current, log: {
        active: ended ? null : next,
        history: ended ? [ended, ...current.log.history] : current.log.history,
      } };
    });
  }

  let content;
  if (state.status === 'loading') {
    content = <Text style={styles.secondary}>{t.planLoading}</Text>;
  } else if (state.status === 'failed') {
    content = <Card title={t.initialPlan} icon="workout">
      <Text accessibilityRole="alert" style={styles.secondary}>{t.planLoadFailed}</Text>
      <Action label={t.retry} onPress={reload} />
    </Card>;
  } else if (state.status === 'ready') {
    const { profile, plan, log } = state;
    const block = profile ? planBlock(profile.profile) : 'planNeedsProfile';
    const accepted = Boolean(plan && plan.profileSavedAt === profile?.savedAt);
    const recovery = profile && <RecoveryPanel key={profile.savedAt} profile={profile} plan={plan} history={log.history} />;

    if (log.active) {
      const session = log.active;
      if (session.checklist) return <WorkoutChecklist key={session.id} session={session} history={log.history}
        profile={profile?.profile} onChanged={(next) => updateLog(session, next)} onReload={reload} />;
      return <ActiveWorkout key={session.id} session={session} history={log.history} profile={profile?.profile}
        onChecklist={() => {
          void updateWorkout({ ...session, checklist: true }).then((next) => {
            if (next) updateLog(session, next);
            else reload();
          }, reload);
        }}
        onChanged={(next) => updateLog(session, next)} onReload={reload} />;
    }

    const scheduledToday = plan?.plan.sessions.find((entry) => entry.day === new Date().getDay())
      ?? (plan && makeUpWorkout(today, plan, log.history));
    const selected = checkIn ?? (todayWorkout === today && scheduledToday ? { day: scheduledToday.day, checklist: false } : undefined);
    const selectedDay = plan?.plan.sessions.find((entry) => entry.day === selected?.day);
    if (profile && plan && accepted && !block && selected && selectedDay) {
      return <Page title={t.workout} icon="workout">
        {startFailed && <Text accessibilityRole="alert" style={styles.secondary}>{t.workoutStartError}</Text>}
        <WorkoutCheckIn key={selected.day} duration={selectedDay.minutes} busy={starting}
          preview={(mode, minutes) => {
            const draft = newSession(plan, selected.day, profile.profile.units, undefined, { mode, minutes });
            return <WorkoutTargets session={{ ...draft, id: 0 }} history={log.history} profile={profile.profile} />;
          }}
          onStart={(mode, minutes) => { void start(plan, profile, selected.day, selected.checklist, mode, minutes); }}
          onCancel={() => {
            setCheckIn(undefined);
            setStartFailed(false);
            if (todayWorkout) router.setParams({ todayWorkout: '' });
          }} />
      </Page>;
    }

    const finished = log.history.find((session) => session.id === finishedId);
    const records = workoutPersonalBests(log.history);
    if (finished) {
      const canReview = profile && profile.profile.age >= 18 && profile.profile.allowSuggestions;
      return <Page title={t.workoutFinishedTitle} icon="workout">
        <Card title={t[weekdays[finished.schedule.day - 1]]} icon="history" tone="accent">
          <Text style={styles.headline}>{countSets(finished)} {t.workoutSetsLogged}</Text>
          {countCheckOnly(finished) > 0 && <Text style={styles.body}>{t.checkOnly} · {countCheckOnly(finished)}</Text>}
          {countWarmupSets(finished) > 0 && <Text style={styles.secondary}>
            {t.workoutWarmupCount} {countWarmupSets(finished)}
          </Text>}
          {records.has(finished.id) && <Text style={styles.body}>{t.workoutPersonalRecord}</Text>}
          <View style={styles.row}>
            <SecondaryButton label={t.shareCheckIn} onPress={() => router.push({
              pathname: '/training-share', params: { workout: String(finished.id) },
            })} />
            {!showRecovery && canReview && <SecondaryButton label={t.recoveryOpen} onPress={() => setShowRecovery(true)} />}
          </View>
        </Card>
        {showRecovery && profile && <RecoveryPanel profile={profile} plan={plan} history={log.history} openInitially />}
        <Card title={language === 'zh' ? '下次训练建议' : 'Next workout'} tone="accent">
          {finished.stoppedForPain ? <Text accessibilityRole="alert" style={styles.secondary}>{language === 'zh'
            ? '本次因异常疼痛结束。本次记录不会用来建议加重。'
            : 'This workout ended due to unusual pain. This record will not support a weight increase.'}</Text> : countSets(finished) > 0 ? <WorkoutTargets session={{ ...finished, startedAt: new Date().toISOString(),
            sets: finished.schedule.exercises.map(() => []), mode: 'progressMode', differentEquipment: undefined,
            equipmentChanges: undefined }} history={log.history} profile={profile?.profile} />
            : <Text style={styles.secondary}>{language === 'zh'
              ? '本次只记录了完成情况。下次记录实际组次和难度后，才能判断是否进阶。'
              : 'This workout recorded checkmarks only. Log actual sets and effort to assess progression.'}</Text>}
        </Card>
        <WorkoutHistory history={[finished]} records={records} />
        <View style={styles.row}>
          <SecondaryButton label={t.workoutHistory} onPress={() => { setSection('history'); setFinishedId(undefined); }} />
          <SecondaryButton label={t.workoutWeekPlan} onPress={() => { setSection('plan'); setFinishedId(undefined); }} />
        </View>
      </Page>;
    }

    const chooseSection = <View accessibilityRole="radiogroup" accessibilityLabel={t.workout} style={styles.row}>
      <Choice label={t.workoutWeekPlan} selected={section === 'plan'} disabled={starting} onPress={() => setSection('plan')} />
      <Choice label={t.workoutHistory} selected={section === 'history'} disabled={starting} onPress={() => setSection('history')} />
    </View>;
    if (section === 'history' && preview !== '1') return <Page title={t.workout} icon="workout">
      {chooseSection}
      <WorkoutHistory history={log.history} records={records} actions={(item) => <SecondaryButton label={t.shareCheckIn}
        onPress={() => router.push({ pathname: '/training-share', params: { workout: String(item.id) } })} />} />
      <SecondaryButton label={t.runHistory} onPress={() => router.push({ pathname: '/running', params: { mode: 'history' } })} />
      {openAccount && <SecondaryButton label={t.workoutAccountOpen} onPress={openAccount} />}
    </Page>;

    if (block || !profile) {
      content = <>
        {chooseSection}
        <Card title={t.initialPlan} icon="workout" tone="accent">
          <Text style={styles.secondary}>{t[block ?? 'planNeedsProfile']}</Text>
          <Action label={t.planOpenProfile} icon="arrow" onPress={() => router.navigate('/profile')} />
        </Card>
        <RunWeek today={today} />
        <SecondaryButton label={t.exportPlan} onPress={() => router.push('/training-share')} />
        {recovery}
      </>;
    } else if (editingProfile === profile.savedAt || (preview === '1' && !accepted)) {
      return <PlanEditor key={profile.savedAt} revision={profile} previous={plan} compact={preview === '1'}
        onAccepted={(next) => {
          setState((current) => current.status === 'ready' ? { ...current, plan: next } : current);
          setEditingProfile(undefined);
          router.setParams({ preview: '0' });
          setShowSaved(true);
          setSection('plan');
        }} onStale={reload} onCancel={() => {
          router.setParams({ preview: '0' });
          setEditingProfile(undefined);
        }} />;
    } else {
      const weekday = new Date().getDay();
      const scheduled = accepted && plan ? plan.plan.sessions.find((session) => session.day === weekday) : undefined;
      content = <>
        {chooseSection}
        <Card title={t.initialPlan} icon="workout" tone="accent">
          <Text accessibilityRole={showSaved && accepted ? 'alert' : undefined} style={accepted ? styles.headline : styles.secondary}>
            {t[accepted ? 'planAccepted' : plan ? 'planProfileChanged' : 'planIntro']}
          </Text>
          {startFailed && <Text accessibilityRole="alert" style={styles.secondary}>{t.workoutStartError}</Text>}
          {scheduled && plan && <Action label={`${t.workoutStart} · ${t[weekdays[scheduled.day - 1]]}`}
            icon="arrow" disabled={starting} onPress={() => { setCheckIn({ day: scheduled.day, checklist: false }); }} />}
          {accepted
            ? <SecondaryButton label={t.planAdjust} disabled={starting} onPress={() => editPlan(profile)} />
            : <Action label={t.planCreate} icon="arrow" onPress={() => editPlan(profile)} />}
          {showSaved && <Action label={t.setupGoHome} onPress={() => router.navigate('/')} />}
          <SecondaryButton label={t.exportPlan} onPress={() => router.push('/training-share')} />
        </Card>
        <RunWeek today={today} />
        {accepted && plan && <PlanSchedule plan={plan.plan}
          sessionLabel={(day) => {
            const date = shiftDay(monday, day - 1);
            const record = log.history.find((item) => item.planSavedAt === plan.savedAt && item.schedule.day === day
              && (item.planDay ?? localDay(new Date(item.endedAt!))) === date);
            if (!record) return date;
            const progress = plannedWorkoutProgress(record);
            return `${date} · ${progress.done} / ${progress.total} ${t.sets}`;
          }}
          onCheck={(day) => { setCheckIn({ day, checklist: true }); }}
          startDisabled={starting} onStart={(day) => { setCheckIn({ day, checklist: false }); }} />}
        {recovery}
      </>;
    }
  }

  return (
    <Page title={t.workout} icon="workout">
      {content}
    </Page>
  );
}

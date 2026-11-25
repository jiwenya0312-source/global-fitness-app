import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { playHaptic, type HapticFeedback } from '@/fitness/haptics';

import { isDay, localDay, shiftDay } from '@/fitness/calendar';
import { useLanguage } from '@/fitness/language';
import { parseDecimal } from '@/fitness/profile';
import { readRunRoute, removeRunRoute, startRunGps, stopRunGps, supportsRunGps } from '@/fitness/run-gps';
import { summarizeRoute } from '@/fitness/run-route';
import { durationText, elapsedRun, isRunDone, type RunDraft, type RunningData } from '@/fitness/running';
import { useRunning } from '@/fitness/running-provider';
import { RunHistoryList } from '@/fitness/running-ui';
import { Action, Card, Choice, InputField, Page, SecondaryButton, styles } from '@/fitness/ui';

export default function Running() {
  const router = useRouter();
  const { mode, day: requestedDay } = useLocalSearchParams<{ mode?: string; day?: string }>();
  const { t } = useLanguage();
  const { state, update, reload } = useRunning();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const initialStart = useRef(false);
  const active = state.status === 'ready' ? state.data.active : null;

  const updateRun = useCallback<UpdateRun>(async (change, feedback) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      let changed = false;
      await update((data) => {
        const next = change(data);
        changed = next !== data;
        return next;
      });
      if (changed && feedback) playHaptic(feedback);
      return true;
    } catch {
      setError(true);
      playHaptic('error');
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, [update]);

  useEffect(() => {
    if (mode !== 'start' || state.status !== 'ready' || initialStart.current) return;
    initialStart.current = true;
    if (state.data.active) return;
    void Promise.resolve().then(() => updateRun((data) => startRun(data, requestedDay), 'selection'));
  }, [mode, requestedDay, state, updateRun]);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return <Page title={t[mode === 'plan' ? 'runPlan' : mode === 'history' ? 'runHistory' : 'runTitle']} icon="run" standalone>
    <SecondaryButton label={t.runBack} icon="previous" disabled={busy} onPress={close} />
    {state.status === 'loading' && <Text style={styles.secondary}>{t.runLoading}</Text>}
    {state.status === 'failed' && <Action label={t.retry} onPress={reload} />}
    {error && <Text accessibilityRole="alert" style={styles.secondary}>{t.runSaveFailed}</Text>}
    {state.status === 'ready' && (mode === 'plan'
      ? <PlanRun key={requestedDay ?? 'new'} data={state.data} day={requestedDay} busy={busy}
        onSave={updateRun} onClose={close} />
      : mode === 'history' ? <RunHistoryList history={state.data.history} />
        : active ? <RunTimer key={active.startedAt} run={active} busy={busy} onSave={updateRun}
          onFinished={() => router.setParams({ mode: 'history' })} /> : <Card title={t.runTitle} icon="run" tone="accent">
          <Text style={styles.secondary}>{t.runTimerHint}</Text>
          <Action label={t.runStart} disabled={busy} onPress={() => { void updateRun((data) => startRun(data, requestedDay), 'selection'); }} />
        </Card>)}
  </Page>;
}

function startRun(data: RunningData, requestedDay?: string): RunningData {
  if (data.active) return data;
  const now = Date.now();
  const day = requestedDay ?? localDay(new Date(now));
  const task = data.tasks.find((item) => item.day === day && !isRunDone(item, data.history));
  return { ...data, active: { startedAt: now, resumedAt: now, elapsed: 0, taskDay: task?.day } };
}

type UpdateRun = (change: (data: RunningData) => RunningData, feedback?: HapticFeedback) => Promise<boolean>;

function RunTimer({ run, busy, onSave, onFinished }: { run: RunDraft; busy: boolean; onSave: UpdateRun; onFinished: () => void }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(Date.now);
  const [ending, setEnding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [distance, setDistance] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);
  const [estimate, setEstimate] = useState(0);
  const supported = supportsRunGps();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 300);
    const listener = AppState.addEventListener('change', (status) => { if (status === 'active') setNow(Date.now()); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);

  useEffect(() => {
    if (!run.gps) return;
    let live = true;
    const refresh = () => {
      void readRunRoute(run.startedAt).then((points) => {
        if (live) setEstimate(summarizeRoute(points).meters);
      }, () => { if (live) setGpsFailed(true); });
    };
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => { live = false; clearInterval(interval); };
  }, [run.gps, run.startedAt]);

  async function connectGps() {
    setGpsBusy(true);
    setGpsFailed(false);
    try {
      if (!await startRunGps(t.exportPosterBrand, t.runGpsNotice)) {
        setGpsFailed(true);
        return;
      }
      if (!run.gps && !await onSave((data) => data.active?.startedAt === run.startedAt
        ? { ...data, active: { ...data.active, gps: true } } : data)) await stopRunGps();
    } catch {
      setGpsFailed(true);
    } finally {
      setGpsBusy(false);
    }
  }

  async function pauseOrResume() {
    const paused = run.resumedAt === null;
    const saved = await onSave((data) => {
      if (data.active?.startedAt !== run.startedAt) return data;
      const time = Date.now();
      return { ...data, active: { ...data.active, resumedAt: paused ? time : null, elapsed: elapsedRun(data.active, time) } };
    }, 'selection');
    if (!saved || !run.gps) return;
    if (paused) await connectGps();
    else await stopRunGps().catch(() => setGpsFailed(true));
  }

  async function prepareFinish() {
    const saved = await onSave((data) => data.active?.startedAt === run.startedAt
      ? { ...data, active: { ...data.active, elapsed: elapsedRun(data.active, Date.now()), resumedAt: null } } : data);
    if (!saved) return;
    if (run.gps) await stopRunGps().catch(() => setGpsFailed(true));
    setEnding(true);
  }

  async function finish() {
    const manual = distance.trim() ? parseDecimal(distance) : undefined;
    if (manual !== undefined && !(manual > 0 && manual <= 1000)) {
      setInvalid(true);
      playHaptic('error');
      return;
    }
    const meters = run.gps ? await readRunRoute(run.startedAt).then((points) => summarizeRoute(points).meters, () => estimate) : 0;
    const gpsDistance = manual === undefined && meters >= 10;
    const km = gpsDistance ? Number((meters / 1000).toFixed(3)) : manual;
    if (await onSave((data) => {
      if (data.active?.startedAt !== run.startedAt) return data;
      const endedAt = Date.now();
      const elapsed = elapsedRun(data.active, endedAt);
      if (elapsed < 1000) return data;
      return { ...data, active: null, history: [
        { startedAt: run.startedAt, endedAt, elapsed, km, taskDay: run.taskDay, gps: run.gps, gpsDistance }, ...data.history,
      ] };
    }, 'success')) onFinished();
  }

  const elapsed = elapsedRun(run, now);
  return <Card title={t[ending ? 'runSave' : 'runTitle']} icon="run" tone="accent">
    <Text style={styles.headline}>{durationText(elapsed)}</Text>
    {run.taskDay && <Text style={styles.body}>{t.runPlan} · {run.taskDay}</Text>}
    {run.gps && <Text style={styles.secondary}>{estimate >= 10
      ? `${t.runGpsDistance} · ${(estimate / 1000).toFixed(2)} km` : t.runGpsLocating}</Text>}
    {gpsFailed && <Text accessibilityRole="alert" style={styles.secondary}>{t.runGpsFailed}</Text>}
    {ending ? <>
      <InputField label={t.runDistance} value={distance} decimal busy={busy} maxLength={10}
        change={(value) => { setInvalid(false); setDistance(value); }} />
      {invalid && <Text accessibilityRole="alert" style={styles.secondary}>{t.runDistanceInvalid}</Text>}
      <Action label={t.runSave} disabled={busy || gpsBusy || elapsed < 1000} onPress={() => { void finish(); }} />
      <SecondaryButton label={t.profileCancel} disabled={busy} onPress={() => setEnding(false)} />
    </> : confirmDiscard ? <>
      <Text style={styles.body}>{t.runDiscardPrompt}</Text>
      <Action label={t.runDiscard} disabled={busy || gpsBusy} onPress={() => {
        void onSave((data) => data.active?.startedAt === run.startedAt ? { ...data, active: null } : data).then(async (saved) => {
          if (!saved || !run.gps) return;
          await stopRunGps().catch(() => {});
          await removeRunRoute(run.startedAt).catch(() => {});
        });
      }} />
      <SecondaryButton label={t.profileCancel} disabled={busy} onPress={() => setConfirmDiscard(false)} />
    </> : <>
      <View style={styles.row}>
        <Action label={t[run.resumedAt === null ? 'runResume' : 'runPause']} disabled={busy || gpsBusy}
          onPress={() => { void pauseOrResume(); }} />
        <SecondaryButton label={t.runFinish} disabled={busy || gpsBusy || elapsed < 1000}
          onPress={() => { void prepareFinish(); }} />
      </View>
      {supported && run.resumedAt !== null && (!run.gps || gpsFailed) && <>
        <SecondaryButton label={t[run.gps ? 'runGpsRetry' : 'runGpsEnable']} disabled={busy || gpsBusy}
          onPress={() => { void connectGps(); }} />
        {!run.gps && <Text style={styles.secondary}>{t.runGpsHint}</Text>}
      </>}
      <SecondaryButton label={t.runDiscard} disabled={busy || gpsBusy} onPress={() => setConfirmDiscard(true)} />
    </>}
  </Card>;
}

function PlanRun({ data, day, busy, onSave, onClose }: {
  data: RunningData; day?: string; busy: boolean; onSave: UpdateRun; onClose: () => void;
}) {
  const { t } = useLanguage();
  const today = localDay();
  const existing = data.tasks.find((task) => task.day === day);
  const [date, setDate] = useState(existing?.day ?? today);
  const [minutes, setMinutes] = useState(existing?.minutes ?? 25);
  const [invalid, setInvalid] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [remove, setRemove] = useState(false);
  const locked = !!existing && (isRunDone(existing, data.history) || data.active?.taskDay === existing.day);

  async function save() {
    const when = date.trim();
    if (!isDay(when) || when < today) {
      setInvalid(true);
      playHaptic('error');
      return;
    }
    if (data.tasks.some((task) => task.day === when && task.day !== existing?.day)) {
      setDuplicate(true);
      playHaptic('error');
      return;
    }
    if (await onSave((current) => {
      if (locked || current.tasks.some((task) => task.day === when && task.day !== existing?.day)) return current;
      return { ...current, tasks: [...current.tasks.filter((task) => task.day !== existing?.day),
        { day: when, minutes, checked: false }].sort((a, b) => a.day.localeCompare(b.day)) };
    }, 'success')) onClose();
  }

  return <Card title={t.runEasy} icon="run" tone="accent">
    <InputField label={t.bodyDateInput} value={date} busy={busy || locked} maxLength={10}
      change={(value) => { setDate(value); setInvalid(false); setDuplicate(false); }} />
    <SecondaryButton label={t.runTomorrow} disabled={busy || locked} onPress={() => {
      setDate(shiftDay(today, 1)); setInvalid(false); setDuplicate(false);
    }} />
    <Text style={styles.body}>{t.runTarget}</Text>
    <View style={styles.row}>
      {[15, 20, 25, 30, 40, 60].map((value) => <Choice key={value} label={`${value} ${t.planMinutes}`}
        selected={value === minutes} disabled={busy || locked} onPress={() => setMinutes(value)} />)}
    </View>
    {invalid && <Text accessibilityRole="alert" style={styles.secondary}>{t.runDateInvalid}</Text>}
    {duplicate && <Text accessibilityRole="alert" style={styles.secondary}>{t.runDateDuplicate}</Text>}
    {locked ? <Text style={styles.secondary}>{t.runPlanLocked}</Text>
      : <Action label={t.runPlanSave} disabled={busy} onPress={() => { void save(); }} />}
    {existing && !locked && (remove ? <>
      <Text style={styles.secondary}>{t.runRemovePrompt}</Text>
      <Action label={t.runPlanRemove} disabled={busy} onPress={() => {
        void onSave((current) => ({ ...current, tasks: current.tasks.filter((task) => task.day !== existing.day) }))
          .then((saved) => { if (saved) onClose(); });
      }} />
      <SecondaryButton label={t.profileCancel} disabled={busy} onPress={() => setRemove(false)} />
    </> : <SecondaryButton label={t.runPlanRemove} disabled={busy} onPress={() => setRemove(true)} />)}
  </Card>;
}

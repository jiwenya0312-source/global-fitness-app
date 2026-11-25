import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Text, View } from 'react-native';

import { planRows, runRow, strengthRows } from '@/fitness/activity-export';
import { ActivityPoster } from '@/fitness/activity-poster';
import { activityWorkbook, xlsxMimeType } from '@/fitness/activity-xlsx';
import { localDay, shiftDay } from '@/fitness/calendar';
import { saveExportFile } from '@/fitness/data-export-file';
import { useLanguage } from '@/fitness/language';
import { foodTotal, roundAmount, type FoodEntry } from '@/fitness/nutrition';
import { readNutritionDay } from '@/fitness/nutrition-store';
import { capturePoster, sharePoster } from '@/fitness/poster-file';
import { readPlan, readProfile } from '@/fitness/profile-store';
import { mondayOf } from '@/fitness/running';
import { useRunning } from '@/fitness/running-provider';
import { Action, Card, Choice, Page, SecondaryButton, styles } from '@/fitness/ui';
import { planBlock } from '@/fitness/workout-plan';
import { readWorkoutLog } from '@/fitness/workout-store';

async function loadPlan() {
  const [profile, plan, workouts] = await Promise.all([readProfile(), readPlan(), readWorkoutLog()]);
  const accepted = plan && profile && plan.profileSavedAt === profile.savedAt && !planBlock(profile.profile) ? plan : null;
  return { profile: profile?.profile, plan: accepted, workouts };
}

export default function TrainingShare() {
  const router = useRouter();
  const { workout, run } = useLocalSearchParams<{ workout?: string; run?: string }>();
  const { t } = useLanguage();
  const { state: running, reload: reloadRuns } = useRunning();
  const [limit, setLimit] = useState<'day' | 'week'>('day');
  const [today] = useState(localDay);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadPlan>> | null>();
  const result = Boolean(workout || run);
  const [preview, setPreview] = useState(result);
  const [imageReady, setImageReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'exportDone' | 'exportFailed'>();
  const [showDinner, setShowDinner] = useState(false);
  const [dinner, setDinner] = useState<{ day: string; entries: FoodEntry[] }>();
  const working = useRef(false);
  const poster = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    let live = true;
    void loadPlan().then((record) => { if (live) setLoaded(record); }, () => { if (live) setLoaded(null); });
    return () => { live = false; };
  }, [attempt]);

  const workoutHistory = loaded?.workouts.history ?? [];
  const item = workoutHistory.find((entry) => String(entry.id) === workout);
  const runningData = running.status === 'ready' ? running.data : undefined;
  const runEntry = runningData?.history.find((entry) => String(entry.startedAt) === run);
  const from = limit === 'day' ? today : mondayOf(today);
  const through = limit === 'day' ? from : shiftDay(from, 6);
  const rows = item && loaded
    ? strengthRows(item, workoutHistory, t, loaded.profile)
    : runEntry ? [runRow(runningData?.tasks.find((task) => task.day === runEntry.taskDay), runEntry, t)]
      : result || !loaded || !runningData ? []
        : planRows({ plan: loaded.plan, profile: loaded.profile, tasks: runningData.tasks, runs: runningData.history,
          history: loaded.workouts.active ? [loaded.workouts.active, ...workoutHistory] : workoutHistory,
          from, through, today, t });
  const title = t[result ? 'posterCheckTitle' : 'posterPlanTitle'];
  const actualDay = item?.endedAt ? localDay(new Date(item.endedAt)) : undefined;
  const resultDay = actualDay ?? (runEntry ? localDay(new Date(runEntry.startedAt)) : today);
  const plannedDay = rows[0]?.day;
  const dateLabel = result
    ? plannedDay && plannedDay !== resultDay ? `${resultDay} · ${t.exportPlannedDay} ${plannedDay}` : resultDay
    : from === through ? from : `${from} – ${through}`;

  useEffect(() => {
    if (!actualDay || !showDinner) return;
    let live = true;
    void readNutritionDay(actualDay).then((data) => {
      if (live) setDinner({ day: actualDay, entries: data.entries.filter((entry) => entry.meal === 'dinner') });
    }, () => { if (live) setDinner({ day: actualDay, entries: [] }); });
    return () => { live = false; };
  }, [actualDay, showDinner]);
  const dinnerItems = showDinner && dinner?.day === actualDay ? dinner?.entries.map((entry) =>
    `${entry.name} · ${roundAmount(foodTotal(entry).kcal)} kcal`) : undefined;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/explore');
  }

  async function deliver(action: 'excel' | 'save' | 'share') {
    if (working.current || !rows.length) return;
    working.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const name = `global-fitness-${result ? `check-in-${resultDay}` : `plan-${from}${from === through ? '' : `_${through}`}`}`;
      if (action === 'excel') {
        if (await saveExportFile(`${name}.xlsx`, activityWorkbook(rows, t, `${title} · ${dateLabel}`), xlsxMimeType)) {
          setNotice('exportDone');
        }
      } else if (poster.current) {
        const image = await capturePoster(poster.current);
        if (action === 'share') {
          if (!await sharePoster(`${name}.png`, image)) setNotice('exportFailed');
        } else if (await saveExportFile(`${name}.png`, image, 'image/png', 'base64')) setNotice('exportDone');
      }
    } catch {
      setNotice('exportFailed');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return <Page title={t[result ? 'shareCheckIn' : 'exportPlan']} icon="calendar" standalone>
    <SecondaryButton label={t.runBack} icon="previous" disabled={busy} onPress={close} />
    {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
    {(loaded === undefined || running.status === 'loading') && <Text style={styles.secondary}>{t.planLoading}</Text>}
    {(loaded === null || running.status === 'failed') && <Card title={t.planLoadFailed}>
      <Action label={t.retry} onPress={() => {
        setLoaded(undefined);
        setAttempt((value) => value + 1);
        if (running.status === 'failed') reloadRuns();
      }} />
    </Card>}
    {loaded && runningData && (!preview ? <Card title={dateLabel} tone="accent">
      <View style={styles.row}>
        {(['day', 'week'] as const).map((value) => <Choice key={value} label={t[value === 'day' ? 'exportToday' : 'exportWeek']}
          selected={value === limit} disabled={busy} onPress={() => { setLimit(value); setNotice(undefined); }} />)}
      </View>
      {rows.length ? <View style={styles.row}>
        <Action label={t.exportExcel} disabled={busy} onPress={() => { void deliver('excel'); }} />
        <SecondaryButton label={t.exportPoster} disabled={busy} onPress={() => { setImageReady(false); setNotice(undefined); setPreview(true); }} />
      </View> : <Text style={styles.secondary}>{t.exportPlanEmpty}</Text>}
    </Card> : rows.length ? <>
      <View style={styles.row}>
        {!result && <SecondaryButton label={t.exportPreviewBack} disabled={busy} onPress={() => setPreview(false)} />}
        <Action label={t.exportSavePoster} disabled={!imageReady || busy} onPress={() => { void deliver('save'); }} />
        {Platform.OS !== 'web' && <SecondaryButton label={t.exportSharePoster} disabled={!imageReady || busy}
          onPress={() => { void deliver('share'); }} />}
      </View>
      {actualDay && <Choice label={t.posterIncludeDinner} selected={showDinner} disabled={busy}
        onPress={() => setShowDinner((value) => !value)} />}
      {showDinner && dinner?.day === actualDay && !dinnerItems?.length &&
        <Text style={styles.secondary}>{t.posterNoDinner}</Text>}
      <ActivityPoster rows={rows} title={title} dates={dateLabel} result={result} dinner={dinnerItems}
        viewRef={poster} onReady={() => setImageReady(true)} />
    </> : <Text style={styles.secondary}>{t.exportPlanEmpty}</Text>)}
  </Page>;
}

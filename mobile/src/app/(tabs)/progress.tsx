import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/auth/account-provider';
import type { BodyWorkspace } from '@/fitness/account-body';
import { deleteAccountMeasurement, readAccountMeasurements, saveAccountMeasurement } from '@/fitness/account-body-store';
import { AccountBodySync } from '@/fitness/account-body-sync';
import { BodyRecordEditor } from '@/fitness/body-form';
import {
  measurementText, measurementUnit, metrics, rawMeasurement,
  type BodyRecord, type MeasurementUnits, type Metric, type TrendPeriod,
} from '@/fitness/body-measurements';
import { deleteBodyRecord, readBodyRecords, saveBodyRecord } from '@/fitness/body-store';
import { BodyTrend } from '@/fitness/body-trend';
import { dayDate, localDay, shiftDay } from '@/fitness/calendar';
import { useLanguage } from '@/fitness/language';
import { readProfile } from '@/fitness/profile-store';
import { ProgressPhotos } from '@/fitness/progress-photos';
import { Action, Card, colors, Page, SecondaryButton, Stat, styles } from '@/fitness/ui';
import { WeeklyReportScreen } from '@/fitness/weekly-report-screen';

type Editor = { day: string; record?: BodyRecord };

type ProgressState =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; today: string; records: BodyRecord[]; units: MeasurementUnits; workspace: BodyWorkspace | null };

export default function Progress() {
  const router = useRouter();
  const { weekly, record } = useLocalSearchParams<{ weekly?: string; record?: string }>();
  const { state } = useAccount();
  const [opened, setOpened] = useState<string>();
  const [showWeekly, setShowWeekly] = useState(false);
  const closeWeekly = useCallback(() => setShowWeekly(false), []);
  const accountId = state.status === 'signedIn' ? state.userId : undefined;
  const owner = opened === accountId ? accountId : undefined;
  useFocusEffect(useCallback(() => {
    if (weekly === '1') {
      setOpened(undefined);
      setShowWeekly(true);
      router.setParams({ weekly: '0' });
    }
  }, [router, weekly]));

  if (record === '1') return <ProgressRecords key="quick-body" returnHome={() => {
      setShowWeekly(false);
      setOpened(undefined);
      router.setParams({ record: '0' });
      router.navigate('/');
    }} />;
  if (showWeekly) return <WeeklyReportScreen onClose={closeWeekly} />;
  return <ProgressRecords key={owner ?? 'device'} owner={owner}
    openAccount={accountId ? () => setOpened(accountId) : undefined} closeAccount={() => setOpened(undefined)}
    openWeekly={() => setShowWeekly(true)} />;
}

function ProgressRecords({ owner, openAccount, closeAccount, openWeekly, returnHome }: {
  owner?: string; openAccount?: () => void; closeAccount?: () => void; openWeekly?: () => void; returnHome?: () => void;
}) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [state, setState] = useState<ProgressState>({ status: 'loading' });
  const [displayUnits, setDisplayUnits] = useState<MeasurementUnits>();
  const [metric, setMetric] = useState<Metric>('weight');
  const [period, setPeriod] = useState<TrendPeriod>(30);
  const [selectedEditor, setEditor] = useState<Editor | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [visible, setVisible] = useState(10);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [notice, setNotice] = useState<'bodyConflict' | 'bodyWriteError' | 'bodySaved' | 'bodyDeleted'>();
  const request = useRef(0);
  const pending = useRef(false);
  const editor = returnHome && state.status === 'ready'
    ? { day: state.today, record: state.records.find((record) => record.day === state.today) }
    : selectedEditor;

  const load = useCallback(() => {
    const id = ++request.current;
    setState({ status: 'loading' });
    const body = owner ? readAccountMeasurements(owner) : readBodyRecords().then((records) => ({ records, workspace: null }));
    Promise.all([body, readProfile()]).then(([data, profile]) => {
      if (request.current !== id) return;
      const today = localDay();
      setState({ status: 'ready', today, ...data, units: profile?.profile.units ?? 'metric' });
    }, () => {
      if (request.current === id) setState({ status: 'failed' });
    });
  }, [owner]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { request.current += 1; };
  }, [load]));

  function closeEditor() {
    if (returnHome) {
      returnHome();
      return;
    }
    setEditor(null);
    setNotice(undefined);
    if (notice === 'bodyConflict') load();
  }

  async function save(write: () => Promise<boolean>, success: 'bodySaved' | 'bodyDeleted') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      if (!(await write())) {
        setNotice('bodyConflict');
        return;
      }
      Keyboard.dismiss();
      if (returnHome) {
        returnHome();
        return;
      }
      setEditor(null);
      setNotice(success);
      load();
    } catch {
      setNotice('bodyWriteError');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const units = displayUnits ?? (state.status === 'ready' ? state.units : 'metric');

  if (showPhotos) return <ProgressPhotos onClose={() => setShowPhotos(false)} />;

  let content;
  if (editor) {
    content = <BodyRecordEditor key={editor.record?.version ?? editor.day} day={editor.day} record={editor.record} units={units}
      busy={busy} onCancel={closeEditor}
      onSave={(day, values) => {
        void save(() => owner ? saveAccountMeasurement(owner, day, values, editor.record)
          : saveBodyRecord(day, values, editor.record), 'bodySaved');
      }}
      onRemove={() => {
        if (editor.record) {
          const record = editor.record;
          void save(() => owner ? deleteAccountMeasurement(owner, record) : deleteBodyRecord(record), 'bodyDeleted');
        }
      }} />;
  } else if (state.status === 'loading') {
    content = <Text style={styles.secondary}>{t.bodyLoading}</Text>;
  } else if (state.status === 'failed') {
    content = <Card title={t.record}>
      <Text accessibilityRole="alert" style={styles.secondary}>{t.bodyReadError}</Text>
      <Action label={t.retry} onPress={load} />
    </Card>;
  } else if (state.status === 'ready') {
    const { today, records, workspace } = state;
    const todayRecord = records.find((record) => record.day === today);
    const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium' });
    content = <>
      <View style={styles.row}>
        {!owner && <SecondaryButton label={t.runHistory} icon="run"
          onPress={() => router.push({ pathname: '/running', params: { mode: 'history' } })} />}
        <Action label={t[todayRecord ? 'bodyEditToday' : 'bodyAdd']} icon={todayRecord ? undefined : 'plus'} disabled={syncBusy}
          onPress={() => { setNotice(undefined); setEditor({ day: today, record: todayRecord }); }} />
        <SecondaryButton label={t.bodyAddEarlier} disabled={syncBusy}
          onPress={() => { setNotice(undefined); setEditor({ day: shiftDay(today, -1) }); }} />
        {!owner && <SecondaryButton label={t.photoTitle} icon="camera" onPress={() => { setNotice(undefined); setShowPhotos(true); }} />}
      </View>
      {owner && workspace && <AccountBodySync userId={owner} workspace={workspace} units={units}
        onBusy={setSyncBusy} onChanged={(data) => {
          setState((current) => current.status === 'ready' ? { ...current, ...data } : current);
        }} />}
      <BodyTrend records={records} today={today} units={units} setUnits={setDisplayUnits}
        metric={metric} setMetric={setMetric} period={period} setPeriod={setPeriod} />
      {!owner && openWeekly && <Card title={t.weeklyTitle} icon="calendar" tone="accent">
        <Text style={styles.secondary}>{t.weeklyOverview}</Text>
        <Action label={t.weeklyOpen} icon="arrow" onPress={openWeekly} />
      </Card>}
      <Card title={t.record} icon="history">
        {records.length === 0 && <Text style={styles.secondary}>{t.bodyNoRecords}</Text>}
        {records.slice(0, visible).map((record) => (
          <View key={record.id} style={hisStyles.record}>
            <Text accessibilityRole="header" style={styles.body}>{date.format(dayDate(record.day))}</Text>
            <View style={styles.row}>
              {metrics.map((metric) => {
                const value = rawMeasurement(record, metric);
                return value === null ? null : <Stat key={metric} label={t[metric]}
                  value={`${measurementText(value, metric, units)} ${measurementUnit(metric, units)}`} />;
              })}
            </View>
            <SecondaryButton label={`${t.bodyEdit} · ${record.day}`} disabled={syncBusy} onPress={() => {
              setNotice(undefined);
              setEditor({ day: record.day, record });
            }} />
          </View>
        ))}
        {records.length > visible && <SecondaryButton label={t.workoutMore} onPress={() => setVisible(visible + 10)} />}
      </Card>
    </>;
  }

  return (
    <Page key={editor ? 'editor' : 'progress'} title={t[owner ? 'bodyAccountTitle' : 'progress']} icon="progress">
      {!editor && (owner && closeAccount
        ? <SecondaryButton label={t.bodyAccountExit} disabled={syncBusy} onPress={closeAccount} icon="previous" />
        : openAccount && <SecondaryButton label={t.bodyAccountOpen} onPress={openAccount} icon="cloud" />)}
      {returnHome && !editor && <SecondaryButton label={t.setupGoHome} onPress={returnHome} />}
      {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      {content}
    </Page>
  );
}

const hisStyles = StyleSheet.create({
  record: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
});

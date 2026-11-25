import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CloudRequestError } from '@/auth/cloud-client';
import { syncAccountWorkouts } from '@/auth/cloud-workouts';

import type { WorkoutWorkspace } from './account-workout';
import { copyDeviceWorkouts, deleteAccountWorkout, readAccountWorkouts } from './account-workout-store';
import { useLanguage } from './language';
import { Action, Card, Page, SecondaryButton, styles } from './ui';
import { WorkoutHistory } from './workout-session';

type Notice = 'workoutCloudSynced' | 'workoutCloudMissing' | 'workoutCloudAccount' | 'cloudConnectionError'
  | 'workoutAccountError' | 'workoutAccountCopied' | 'workoutAccountDeleted';
type Confirmation = { action: 'copy' | 'sync' } | { action: 'delete'; id: string };

export function AccountWorkoutScreen({ userId, close }: { userId: string; close: () => void }) {
  const { t } = useLanguage();
  const [workspace, setWorkspace] = useState<WorkoutWorkspace>();
  const [notice, setNotice] = useState<Notice>();
  const [confirm, setConfirm] = useState<Confirmation>();
  const [copied, setCopied] = useState(0);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const pending = useRef(false);

  const load = useCallback(() => {
    const id = ++request.current;
    void readAccountWorkouts(userId).then((data) => {
      if (id === request.current) setWorkspace(data);
    }, () => {
      if (id === request.current) setNotice('workoutAccountError');
    });
  }, [userId]);

  useFocusEffect(useCallback(() => {
    load();
    return () => { request.current += 1; };
  }, [load]));

  async function commit(confirmation: Confirmation) {
    if (pending.current) return;
    pending.current = true;
    request.current += 1;
    setBusy(true);
    setNotice(undefined);
    setConfirm(undefined);
    try {
      if (confirmation.action === 'copy') {
        setCopied(await copyDeviceWorkouts(userId));
        setNotice('workoutAccountCopied');
      } else if (confirmation.action === 'sync') {
        await syncAccountWorkouts(userId);
        setNotice('workoutCloudSynced');
      } else if (confirmation.action === 'delete') {
        await deleteAccountWorkout(userId, confirmation.id);
        setNotice('workoutAccountDeleted');
      }
    } catch (error) {
      const label = error instanceof CloudRequestError ? error.label : 'workoutAccountError';
      setNotice(label === 'cloudSchemaMissing' ? 'workoutCloudMissing'
        : label === 'cloudAccountChanged' ? 'workoutCloudAccount' : label);
    } finally {
      try {
        setWorkspace(await readAccountWorkouts(userId));
      } catch {
        setNotice('workoutAccountError');
      }
      pending.current = false;
      setBusy(false);
    }
  }

  const records = (workspace?.rows ?? []).flatMap(({ id, workout }) => workout ? [{ id, ...workout }] : [])
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const queued = workspace?.rows.filter((record) => record.pending).length;
  const reviewing = confirm?.action === 'sync' || confirm?.action === 'copy' ? confirm : undefined;

  return (
    <Page title={t.workoutAccountTitle} icon="history">
      <SecondaryButton label={t.workoutDeviceHistory} disabled={busy} onPress={close} />
      <Card title={t.workoutCloudTitle} icon="cloud" tone="accent">
        <Text style={styles.secondary}>{t.workoutCloudSummary}</Text>
        {workspace && <Text style={styles.body}>{t.bodyCloudPending} {queued}</Text>}
        {notice && <Text accessibilityRole="alert" style={styles.secondary}>
          {t[notice]}{notice === 'workoutAccountCopied' ? ` ${copied}` : ''}
        </Text>}
        {busy ? <Text accessibilityRole="alert" style={styles.secondary}>{t.bodyCloudWorking}</Text>
          : reviewing ? (
            <>
              <Text style={styles.secondary}>{t[reviewing.action === 'sync' ? 'workoutCloudConsent' : 'workoutCopyConsent']}</Text>
              <View style={styles.row}>
                <Action label={t[reviewing.action === 'sync' ? 'bodyCloudConfirm' : 'workoutCopyConfirm']}
                  onPress={() => { void commit(reviewing); }} />
                <SecondaryButton label={t.profileCancel} onPress={() => setConfirm(undefined)} />
              </View>
            </>
          ) : workspace ? (
            <View style={styles.row}>
              <Action icon="cloud" label={t.bodyCloudSync} onPress={() => setConfirm({ action: 'sync' })} />
              <SecondaryButton label={t.workoutCopyDevice} onPress={() => setConfirm({ action: 'copy' })} />
            </View>
          ) : notice ? <Action label={t.retry} onPress={() => { setNotice(undefined); load(); }} />
            : <Text style={styles.secondary}>{t.planLoading}</Text>}
      </Card>
      {workspace && <WorkoutHistory history={records} actions={({ id }) => (
        confirm?.action === 'delete' && confirm.id === id ? (
          <>
            <Text style={styles.secondary}>{t.workoutDeleteConsent}</Text>
            <View style={styles.row}>
              <Action label={t.workoutDeleteAccount} onPress={() => { void commit(confirm); }} />
              <SecondaryButton label={t.profileCancel} onPress={() => setConfirm(undefined)} />
            </View>
          </>
        ) : <SecondaryButton label={t.workoutDeleteAccount} disabled={busy || Boolean(reviewing)}
          onPress={() => setConfirm({ action: 'delete', id })} />
      )} />}
    </Page>
  );
}

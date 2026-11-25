import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { syncAccountMeasurements } from '@/auth/cloud-body';
import { CloudRequestError } from '@/auth/cloud-client';
import type { AccountBodyRecord, BodyWorkspace, CloudBodyRecord } from './account-body';
import { chooseAccountMeasurement, copyAccountMeasurements, readAccountMeasurements } from './account-body-store';
import { measurementText, measurementUnit, type BodyRecord, type MeasurementUnits } from './body-measurements';
import { readBodyRecords } from './body-store';
import { useLanguage } from './language';
import { Action, Card, SecondaryButton, styles } from './ui';

type Notice = 'bodyCloudSynced' | 'cloudConnectionError' | 'bodyCloudAccount' | 'bodyCloudMissing' |
  'bodyWorkspaceError' | 'bodyWorkspaceChanged' | 'bodyCopied';
type Confirm = 'copy' | 'sync';

export function AccountBodySync({ userId, workspace, units, onBusy, onChanged }: {
  userId: string;
  workspace: BodyWorkspace;
  units: MeasurementUnits;
  onBusy: (busy: boolean) => void;
  onChanged: (data: { workspace: BodyWorkspace; records: BodyRecord[] }) => void;
}) {
  const { t } = useLanguage();
  const [notice, setNotice] = useState<Notice>();
  const [confirm, setConfirm] = useState<Confirm>();
  const [copied, setCopied] = useState(0);
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  const conflicts = workspace.rows.filter((row) => row.conflict);
  const toSync = workspace.rows.filter((row) => row.dirty && !row.conflict).length;

  async function run(action: () => Promise<Notice>) {
    if (pending.current) return;
    pending.current = true;
    setWorking(true);
    onBusy(true);
    setNotice(undefined);
    try {
      setNotice(await action());
    } catch (error) {
      const label = error instanceof CloudRequestError ? error.label : 'bodyWorkspaceError';
      setNotice(label === 'cloudSchemaMissing' ? 'bodyCloudMissing'
        : label === 'cloudAccountChanged' ? 'bodyCloudAccount' : label);
    } finally {
      try {
        onChanged(await readAccountMeasurements(userId));
      } catch {
        setNotice('bodyWorkspaceError');
      }
      pending.current = false;
      setWorking(false);
      setConfirm(undefined);
      onBusy(false);
    }
  }

  function describe(record: AccountBodyRecord | CloudBodyRecord) {
    if (record.deleted) return t.bodyCloudRemoved;
    const weight = record.weightKg === null ? null
      : `${measurementText(record.weightKg, 'weight', units)} ${measurementUnit('weight', units)}`;
    const waist = record.waistCm === null ? null
      : `${measurementText(record.waistCm, 'waist', units)} ${measurementUnit('waist', units)}`;
    return [weight && `${t.weight} ${weight}`, waist && `${t.waist} ${waist}`].filter(Boolean).join(' · ');
  }

  return (
    <>
      <Card title={t.bodyCloudTitle} icon="cloud">
        <Text style={styles.secondary}>{t.bodyCloudSummary}</Text>
        <Text style={styles.body}>{t.bodyCloudPending} {toSync} · {t.bodyCloudConflicts} {conflicts.length}</Text>
        {notice && <Text accessibilityRole="alert" style={styles.secondary}>
          {t[notice]}{notice === 'bodyCopied' ? ` ${copied}` : ''}
        </Text>}
        {working ? <Text accessibilityRole="alert" style={styles.secondary}>{t.bodyCloudWorking}</Text> : (
          confirm ? (
            <>
              <Text style={styles.secondary}>{t[confirm === 'sync' ? 'bodyCloudConsent' : 'bodyCopyConsent']}</Text>
              <View style={styles.row}>
                <Action label={t[confirm === 'sync' ? 'bodyCloudConfirm' : 'bodyCopyConfirm']} onPress={() => {
                  void run(async () => {
                    if (confirm === 'sync') {
                      await syncAccountMeasurements(userId);
                      return 'bodyCloudSynced';
                    }
                    setCopied(await copyAccountMeasurements(userId, await readBodyRecords()));
                    return 'bodyCopied';
                  });
                }} />
                <SecondaryButton label={t.profileCancel} onPress={() => setConfirm(undefined)} />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Action icon="cloud" label={t.bodyCloudSync} onPress={() => setConfirm('sync')} />
              <SecondaryButton label={t.bodyCopyDevice} onPress={() => setConfirm('copy')} />
            </View>
          )
        )}
      </Card>
      {conflicts.map((record) => record.conflict ? (
        <Card key={record.id} title={`${t.bodyCloudConflicts} · ${record.day}`}>
          <Text style={styles.body}>{t.bodyAccountVersion} · {describe(record)}</Text>
          <Text style={styles.body}>{t.bodyRemoteVersion} · {describe(record.conflict)}</Text>
          <View style={styles.row}>
            <SecondaryButton label={t.bodyKeepAccount} disabled={working} onPress={() => {
              void run(async () => await chooseAccountMeasurement(userId, record, 'device')
                ? 'bodyWorkspaceChanged' : 'bodyWorkspaceError');
            }} />
            <SecondaryButton label={t.bodyUseRemote} disabled={working} onPress={() => {
              void run(async () => await chooseAccountMeasurement(userId, record, 'cloud')
                ? 'bodyWorkspaceChanged' : 'bodyWorkspaceError');
            }} />
          </View>
        </Card>
      ) : null)}
    </>
  );
}

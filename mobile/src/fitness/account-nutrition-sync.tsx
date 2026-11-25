import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CloudRequestError } from '@/auth/cloud-client';
import { syncAccountNutrition } from '@/auth/cloud-nutrition';

import type { NutritionValue, NutritionWorkspace } from './account-nutrition';
import { chooseNutritionVersion, copyNutritionToAccount } from './account-nutrition-store';
import { useLanguage } from './language';
import { nutrients } from './nutrition';
import { amountUnits, nutrientUnits } from './nutrition-form';
import { Action, Card, SecondaryButton, styles } from './ui';

type Notice = 'nutritionCloudSynced' | 'nutritionCloudAccount' | 'nutritionCloudMissing' | 'cloudConnectionError'
  | 'nutritionAccountCopied' | 'nutritionAccountError' | 'nutritionStale';

export function AccountNutritionSync({ userId, workspace, onBusy, onChanged }: {
  userId: string;
  workspace?: NutritionWorkspace;
  onBusy: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [confirm, setConfirm] = useState<'copy' | 'sync'>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [copied, setCopied] = useState({ copied: 0, copiedGoals: false });
  const pending = useRef(false);
  const conflicts = workspace?.rows.filter((row) => row.conflict) ?? [];
  const queued = workspace?.rows.filter((row) => row.pending && !row.conflict).length ?? 0;

  async function run(action: () => Promise<Notice | undefined>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setConfirm(undefined);
    setNotice(undefined);
    try {
      setNotice(await action());
    } catch (error) {
      const label = error instanceof CloudRequestError ? error.label : 'nutritionAccountError';
      setNotice(label === 'cloudSchemaMissing' ? 'nutritionCloudMissing'
        : label === 'cloudAccountChanged' ? 'nutritionCloudAccount' : label);
    } finally {
      onChanged();
      setBusy(false);
      onBusy(false);
      pending.current = false;
    }
  }

  return (
    <>
      <Card title={t.nutritionCloudTitle} icon="cloud" tone="accent">
        <Text style={styles.secondary}>{t.nutritionCloudSummary}</Text>
        {workspace && <Text style={styles.body}>
          {t.bodyCloudPending} {queued} · {t.bodyCloudConflicts} {conflicts.length}
        </Text>}
        {notice && <Text accessibilityRole="alert" style={styles.secondary}>
          {t[notice]}{notice === 'nutritionAccountCopied' ? ` ${copied.copied}${copied.copiedGoals ? ` · ${t.nutritionAccountCopiedGoals}` : ''}` : ''}
        </Text>}
        {busy ? <Text accessibilityRole="alert" style={styles.secondary}>{t.bodyCloudWorking}</Text>
          : workspace && (confirm ? (
            <>
              <Text style={styles.secondary}>{t[confirm === 'sync' ? 'nutritionCloudConsent' : 'nutritionCopyConsent']}</Text>
              <View style={styles.row}>
                <Action label={t[confirm === 'sync' ? 'bodyCloudConfirm' : 'workoutCopyConfirm']} onPress={() => {
                  void run(async () => {
                    if (confirm === 'sync') {
                      await syncAccountNutrition(userId);
                      return 'nutritionCloudSynced';
                    }
                    setCopied(await copyNutritionToAccount(userId));
                    return 'nutritionAccountCopied';
                  });
                }} />
                <SecondaryButton label={t.profileCancel} onPress={() => setConfirm(undefined)} />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Action icon="cloud" label={t.bodyCloudSync} onPress={() => setConfirm('sync')} />
              <SecondaryButton label={t.nutritionCopyDevice} onPress={() => setConfirm('copy')} />
            </View>
          ))}
      </Card>
      {conflicts.map((row) => row.conflict && (
        <Card key={row.id} title={row.value?.kind === 'goals' ? t.nutritionGoalConflict : t.nutritionFoodConflict}>
          <NutritionVersion label={t.bodyAccountVersion} value={row.value} />
          <NutritionVersion label={t.bodyRemoteVersion} value={row.conflict.value} />
          <View style={styles.row}>
            <SecondaryButton label={t.bodyKeepAccount} disabled={busy || Boolean(confirm)} onPress={() => {
              void run(async () => await chooseNutritionVersion(userId, row, false) ? undefined : 'nutritionStale');
            }} />
            <SecondaryButton label={t.bodyUseRemote} disabled={busy || Boolean(confirm)} onPress={() => {
              void run(async () => await chooseNutritionVersion(userId, row, true) ? undefined : 'nutritionStale');
            }} />
          </View>
        </Card>
      ))}
    </>
  );
}

function NutritionVersion({ label, value }: { label: string; value: NutritionValue | null }) {
  const { t } = useLanguage();
  const values = value?.kind === 'food' ? value.food.values : value?.values;
  return (
    <View>
      <Text style={styles.body}>{label}</Text>
      {!value && <Text style={styles.secondary}>{t.bodyCloudRemoved}</Text>}
      {value?.kind === 'food' && <Text style={styles.secondary}>
        {value.day} · {t[value.food.meal]} · {value.food.name} · {value.food.amount} {t[amountUnits[value.food.basis]]}
      </Text>}
      {value?.kind === 'food' && <Text style={styles.secondary}>{t.nutritionBasisHint} {t[value.food.basis]}</Text>}
      {values && <Text style={styles.secondary}>{nutrients.map((key) =>
        `${t[key === 'kcal' ? 'energy' : key]} ${values[key]} ${nutrientUnits[key]}`).join(' · ')}</Text>}
    </View>
  );
}

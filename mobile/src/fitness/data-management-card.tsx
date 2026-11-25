import { useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';

import { useAccount } from '@/auth/account-provider';
import { CloudRequestError } from '@/auth/cloud-client';
import { deleteCloudAccount, sendDeletionCode, signOutDeletedAccount, verifyDeletionCode } from '@/auth/cloud-privacy';

import { exportAccountData, exportDeviceData } from './fitness-export';
import { useLanguage } from './language';
import { Action, Card, colors, SecondaryButton, styles } from './ui';

type PrivacyNotice = 'privacySaved' | 'privacyExportFailed' | 'privacyCloudMissing' | 'privacyAccountChanged'
  | 'privacySendFailed' | 'privacyCodeWrong' | 'privacyVerificationAgain' | 'privacyDeleteFailed' | 'privacySignOutFailed';

export function DataManagementCard() {
  const { language, t } = useLanguage();
  const { state } = useAccount();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [accountWorking, setAccountWorking] = useState(false);
  const [notice, setNotice] = useState<PrivacyNotice>();
  const [deletedId, setDeletedId] = useState<string>();
  const pending = useRef(false);

  async function saveDevice() {
    if (pending.current) return;
    pending.current = true;
    setWorking(true);
    setNotice(undefined);
    try {
      if (await exportDeviceData(language)) setNotice('privacySaved');
    } catch {
      setNotice('privacyExportFailed');
    } finally {
      pending.current = false;
      setWorking(false);
    }
  }

  return (
    <>
      <Card title={t.privacyTitle} icon="history">
        <SecondaryButton label={t[open ? 'privacyClose' : 'privacyOpen']} disabled={working || accountWorking}
          onPress={() => { setOpen(!open); setNotice(undefined); }} />
        {deletedId && (state.status !== 'signedIn' || state.userId === deletedId) &&
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.accent }]}>{t.privacyDeleted}</Text>}
        {open && <>
          <Text style={styles.secondary}>{t.privacyDeviceScope}</Text>
          <SecondaryButton label={t.privacyExportDevice} icon="arrow" disabled={working || accountWorking}
            onPress={() => { void saveDevice(); }} />
          {working && <Text accessibilityRole="alert" style={styles.secondary}>{t.privacyExporting}</Text>}
          {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
        </>}
      </Card>
      {open && state.status === 'signedIn' && <AccountDataCard key={state.userId}
        userId={state.userId} email={state.email} deviceWorking={working}
        onBusy={setAccountWorking} onDeleted={() => setDeletedId(state.userId)} />}
    </>
  );
}

type Stage = 'options' | 'review' | 'verify' | 'retryDelete' | 'deleted';

function AccountDataCard({ userId, email, deviceWorking, onBusy, onDeleted }: {
  userId: string; email: string | null; deviceWorking: boolean;
  onBusy: (busy: boolean) => void; onDeleted: () => void;
}) {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>('options');
  const [busy, setBusy] = useState<'export' | 'send' | 'delete' | 'signOut'>();
  const [notice, setNotice] = useState<PrivacyNotice>();
  const [code, setCode] = useState('');
  const [lastSentAt, setLastSentAt] = useState(0);
  const pending = useRef(false);
  const blocked = Boolean(busy) || deviceWorking;

  async function run(operation: NonNullable<typeof busy>, action: () => Promise<void>) {
    if (pending.current || deviceWorking) return;
    pending.current = true;
    setBusy(operation);
    onBusy(true);
    setNotice(undefined);
    try {
      await action();
    } catch (error) {
      if (error instanceof CloudRequestError && error.label === 'cloudSchemaMissing') {
        setNotice('privacyCloudMissing');
      } else if (error instanceof CloudRequestError && error.label === 'cloudAccountChanged') {
        if (operation === 'delete') {
          setStage('review');
          setCode('');
          setNotice('privacyVerificationAgain');
        } else {
          setNotice('privacyAccountChanged');
        }
      } else {
        setNotice(operation === 'export' ? 'privacyExportFailed'
          : operation === 'send' ? 'privacySendFailed'
            : operation === 'signOut' ? 'privacySignOutFailed' : 'privacyDeleteFailed');
      }
    } finally {
      pending.current = false;
      onBusy(false);
      setBusy(undefined);
    }
  }

  function send() {
    if (!email || Date.now() - lastSentAt < 60_000) {
      setNotice('privacySendFailed');
      return;
    }
    void run('send', async () => {
      if (!await sendDeletionCode(userId, email)) {
        setNotice('privacySendFailed');
        return;
      }
      setLastSentAt(Date.now());
      setCode('');
      setStage('verify');
    });
  }

  async function signOut() {
    try {
      if (!await signOutDeletedAccount(userId)) setNotice('privacySignOutFailed');
    } catch {
      setNotice('privacySignOutFailed');
    }
  }

  function remove() {
    if (!email) return;
    const token = code.trim();
    if (stage === 'verify' && !/^\d{6,10}$/.test(token)) {
      setNotice('privacyCodeWrong');
      return;
    }
    Keyboard.dismiss();
    void run('delete', async () => {
      if (stage === 'verify') {
        if (!await verifyDeletionCode(userId, email, token)) {
          setNotice('privacyCodeWrong');
          return;
        }
        setCode('');
        setStage('retryDelete');
      }
      await deleteCloudAccount(userId);
      setStage('deleted');
      onDeleted();
      await signOut();
    });
  }

  function cancel() {
    setStage('options');
    setNotice(undefined);
    setCode('');
  }

  return (
    <Card title={t.privacyAccountTitle} icon="cloud" tone="accent">
      {stage === 'options' && <>
        <Text style={styles.secondary}>{t.privacyAccountScope}</Text>
        <SecondaryButton label={t.privacyExportAccount} icon="arrow" disabled={blocked} onPress={() => {
          void run('export', async () => { if (await exportAccountData(userId)) setNotice('privacySaved'); });
        }} />
        {email && <SecondaryButton label={t.privacyDeleteOpen} disabled={blocked}
          onPress={() => { setNotice(undefined); setStage('review'); }} />}
      </>}
      {stage === 'review' && <>
        <Text style={[styles.body, { color: colors.rose }]}>{t.privacyDeleteOpen}</Text>
        <Text style={styles.secondary}>{t.privacyDeleteScope}</Text>
        <View style={styles.row}>
          <Action label={t.privacySendCode} disabled={blocked} onPress={send} />
          <SecondaryButton label={t.profileCancel} disabled={blocked} onPress={cancel} />
        </View>
      </>}
      {stage === 'verify' && <>
        <Text style={styles.secondary}>{t.privacyCodeSent} {email}</Text>
        <View style={styles.inputField}>
          <Text style={styles.body}>{t.accountCode}</Text>
          <TextInput accessibilityLabel={t.accountCode} value={code} onChangeText={setCode} editable={!blocked}
            inputMode="numeric" autoComplete="one-time-code" maxLength={10} autoCorrect={false} style={styles.input} />
        </View>
        <View style={styles.row}>
          <Action label={t.privacyDeleteFinal} disabled={blocked} onPress={remove} />
          <SecondaryButton label={t.accountResend} disabled={blocked} onPress={send} />
          <SecondaryButton label={t.profileCancel} disabled={blocked} onPress={cancel} />
        </View>
      </>}
      {stage === 'retryDelete' && <>
        <Text style={styles.secondary}>{t.privacyRetryHint}</Text>
        <View style={styles.row}>
          <Action label={t.privacyRetryDelete} disabled={blocked} onPress={remove} />
          <SecondaryButton label={t.profileCancel} disabled={blocked} onPress={cancel} />
        </View>
      </>}
      {stage === 'deleted' && <SecondaryButton label={t.accountSignOut} disabled={blocked}
        onPress={() => { void run('signOut', signOut); }} />}
      {busy && <Text accessibilityRole="alert" style={styles.secondary}>{t[busy === 'export'
        ? 'privacyExporting' : busy === 'send' ? 'accountSending' : busy === 'signOut'
          ? 'accountSigningOut' : 'privacyDeleting']}</Text>}
      {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
    </Card>
  );
}

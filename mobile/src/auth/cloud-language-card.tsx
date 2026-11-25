import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { languageNames, useLanguage, type Language } from '@/fitness/language';
import { Action, Card, SecondaryButton, styles } from '@/fitness/ui';
import { CloudRequestError, type CloudError } from './cloud-client';
import { readCloudLanguage, writeCloudLanguage, type CloudLanguage } from './cloud-language';

type Notice = CloudError | 'cloudApplied' | 'cloudSaved' | 'cloudCleared' | 'cloudConflict';

export function CloudLanguageCard({ userId }: { userId: string }) {
  const { language, setLanguage, t } = useLanguage();
  const [remote, setRemote] = useState<CloudLanguage | null>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const pending = useRef(false);

  async function run(task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      await task();
    } catch (error) {
      setNotice(error instanceof CloudRequestError ? error.label : 'cloudConnectionError');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function read() {
    void run(async () => {
      setRemote(await readCloudLanguage(userId));
    });
  }

  function save(next: Language | null) {
    if (remote === undefined) return;
    void run(async () => {
      const saved = await writeCloudLanguage(userId, next, remote?.version ?? null);
      setConfirmClear(false);
      if (!saved) {
        setRemote(undefined);
        setRemote(await readCloudLanguage(userId));
        setNotice('cloudConflict');
        return;
      }
      setRemote(saved);
      setNotice(next === null ? 'cloudCleared' : 'cloudSaved');
    });
  }

  return (
    <Card title={t.cloudLanguageTitle} icon="cloud">
      <Text style={styles.secondary}>{t.cloudLanguageIntro}</Text>
      <Text style={styles.body}>{t.cloudOnDevice} · {languageNames[language]}</Text>
      {remote !== undefined && (
        <Text style={styles.body}>
          {t.cloudValue} · {remote?.language ? languageNames[remote.language] : t.cloudNoValue}
        </Text>
      )}
      {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      {busy ? <Text accessibilityRole="alert" style={styles.secondary}>{t.cloudWorking}</Text> : (
        confirmClear ? (
          <>
            <Text style={styles.secondary}>{t.cloudClearPrompt}</Text>
            <View style={styles.row}>
              <Action label={t.cloudConfirmClear} onPress={() => save(null)} />
              <SecondaryButton label={t.profileCancel} onPress={() => setConfirmClear(false)} />
            </View>
          </>
        ) : (
          <View style={styles.row}>
            {remote === undefined
              ? <Action label={t.cloudRead} onPress={read} />
              : <SecondaryButton label={t.cloudRefresh} onPress={read} />}
            {remote !== undefined && remote?.language !== language && (
              <Action label={t.cloudSave} onPress={() => save(language)} />
            )}
            {remote?.language && remote.language !== language && (
              <SecondaryButton label={t.cloudApply} onPress={() => {
                if (!remote.language) return;
                setLanguage(remote.language);
                setNotice('cloudApplied');
              }} />
            )}
            {remote?.language && (
              <SecondaryButton label={t.cloudClear} onPress={() => setConfirmClear(true)} />
            )}
          </View>
        )
      )}
    </Card>
  );
}

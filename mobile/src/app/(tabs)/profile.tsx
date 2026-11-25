import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/fitness/pressable';

import { AccountCard } from '@/auth/account-card';
import { useAccount } from '@/auth/account-provider';
import { DataManagementCard } from '@/fitness/data-management-card';
import { languageNames, useLanguage } from '@/fitness/language';
import { displayMeasurement, inchesToCm, poundsToKg, type ProfileRevision } from '@/fitness/profile';
import { ProfileForm } from '@/fitness/profile-form';
import { readProfile } from '@/fitness/profile-store';
import { Action, Card, colors, Page, Stat, styles } from '@/fitness/ui';

import appConfig from '../../../app.json';

const languages = [
  { code: 'zh', label: languageNames.zh },
  { code: 'en', label: languageNames.en },
] as const;

export default function Profile() {
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const { language, setLanguage, t } = useLanguage();
  const [revision, setRevision] = useState<ProfileRevision | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    readProfile().then((result) => {
      if (!active) return;
      setRevision(result);
      setStatus('ready');
    }, () => {
      if (active) setStatus('failed');
    });
    return () => { active = false; };
  }, [attempt]);

  const profile = revision?.profile;
  const imperial = profile?.units === 'imperial';
  const showForm = status === 'ready' && (editing || setup === '1');

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  return (
    <Page title={t.profile} icon="profile">
      {showForm ? (
        <ProfileForm initial={profile} onCancel={() => {
          router.setParams({ setup: '0' });
          setEditing(false);
        }} onSaved={(next) => {
          setRevision(next);
          setEditing(false);
          setSaved(true);
          router.setParams({ setup: '0' });
        }} />
      ) : (
        <Card title={t.userInfo} icon="profile" tone="accent">
          {status === 'loading' && <Text style={styles.secondary}>{t.profileLoading}</Text>}
          {status === 'failed' && (
            <>
              <Text accessibilityRole="alert" style={styles.secondary}>{t.profileLoadError}</Text>
              <Action label={t.retry} onPress={() => {
                setStatus('loading');
                setAttempt((value) => value + 1);
              }} />
            </>
          )}
          {status === 'ready' && (
            <>
              {saved && <Text accessibilityRole="alert" style={profileStyles.selectedText}>{t.profileSaved}</Text>}
              {profile ? (
                <>
                  <Text style={styles.headline}>{t[profile.goal]}</Text>
                  <View style={profileStyles.stats}>
                    <Stat label={t.height}
                      value={`${displayMeasurement(profile.heightCm, imperial ? inchesToCm : 1)} ${imperial ? 'in' : 'cm'}`} />
                    <Stat label={t.weight}
                      value={`${displayMeasurement(profile.weightKg, imperial ? poundsToKg : 1)} ${imperial ? 'lb' : 'kg'}`} />
                  </View>
                  <Text style={styles.secondary}>{`${t[profile.experience]} · ${profile.days} ${t.daysPerWeek} · ${t[profile.venue]}`}</Text>
                  <Text style={styles.secondary}>{t.focusLabel} · {t[profile.focus ?? 'balanced']}
                    {profile.secondaryFocus && profile.secondaryFocus !== 'balanced' ? ` · ${t[profile.secondaryFocus]}` : ''}</Text>
                </>
              ) : <Text style={styles.secondary}>{t.profileEmpty}</Text>}
              <Action label={profile ? t.editProfile : t.createProfile} icon="arrow" onPress={startEditing} />
            </>
          )}
        </Card>
      )}
      {!showForm && <AccountCard />}
      {!showForm && <DataManagementCard />}
      {!showForm && <Card title={t.language} icon="language">
        <View accessibilityRole="radiogroup" accessibilityLabel={t.language} style={profileStyles.languages}>
          {languages.map(({ code, label }) => {
            const selected = code === language;
            return (
              <Pressable key={code} accessibilityRole="radio" accessibilityState={{ checked: selected }}
                onPress={() => setLanguage(code)}
                style={[
                  profileStyles.choice, selected && profileStyles.selected,
                ]}>
                <Text style={[styles.body, selected && profileStyles.selectedText]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>}
      {!showForm && <AppVersion />}
    </Page>
  );
}

function AppVersion() {
  const { t } = useLanguage();
  const { state } = useAccount();
  const config = Constants.expoConfig;
  const environment = Platform.OS === 'web' ? t.versionWeb
    : Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? 'Expo Go'
      : __DEV__ ? t.versionDevelopment : t.versionStandalone;
  const title = appConfig.expo.name;
  const version = config?.version ?? appConfig.expo.version;
  const build = Platform.OS === 'android' && (config?.android?.versionCode ?? appConfig.expo.android.versionCode);
  return (
    <Card title={t.versionAbout}>
      <Text style={styles.body} selectable>{title} · {version}{build ? ` (${build})` : ''}</Text>
      <Text style={styles.secondary} selectable>{environment} · {t[state.status === 'disabled' ? 'versionLocal' : 'versionCloud']}</Text>
    </Card>
  );
}

const profileStyles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 12, borderRadius: 15,
    backgroundColor: colors.background, borderColor: colors.accentBorder, borderWidth: 1 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 4,
    backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 15 },
  choice: { flexGrow: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center',
    borderRadius: 11, paddingHorizontal: 12, paddingVertical: 7 },
  selected: { backgroundColor: colors.activeSurface },
  selectedText: { color: colors.accent, fontWeight: '700' },
});

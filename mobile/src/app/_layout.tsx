import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { AccountProvider } from '@/auth/account-provider';
import { LanguageProvider, useLanguage } from '@/fitness/language';
import { isCompleteProfile, type ProfileRevision } from '@/fitness/profile';
import { readProfile } from '@/fitness/profile-store';
import '@/fitness/run-gps';
import { RunningProvider } from '@/fitness/running-provider';
import { SetupContext } from '@/fitness/setup-context';
import { Action, colors, Page, styles } from '@/fitness/ui';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface },
};

type Access = { status: 'loading' | 'failed' }
  | { status: 'ready'; profile: ProfileRevision | null };

function AppNavigation() {
  const { t } = useLanguage();
  const [access, setAccess] = useState<Access>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void readProfile().then((profile) => {
      if (active) setAccess({ status: 'ready', profile });
    }, () => {
      if (active) setAccess({ status: 'failed' });
    });
    return () => { active = false; };
  }, [attempt]);

  if (access.status !== 'ready') {
    return <Page title={t.setupTitle} icon="profile" standalone>
      <Text accessibilityRole="alert" style={styles.secondary}>
        {t[access.status === 'loading' ? 'profileLoading' : 'profileLoadError']}
      </Text>
      {access.status === 'failed' && <Action label={t.retry} onPress={() => {
        setAccess({ status: 'loading' });
        setAttempt((value) => value + 1);
      }} />}
    </Page>;
  }

  const unlocked = isCompleteProfile(access.profile?.profile);
  return <SetupContext.Provider value={{
    profile: access.profile?.profile,
    complete: (profile) => setAccess({ status: 'ready', profile }),
  }}>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="running" />
        <Stack.Screen name="training-share" />
      </Stack.Protected>
      <Stack.Protected guard={!unlocked}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
    </Stack>
  </SetupContext.Provider>;
}

export default function RootLayout() {
  return <LanguageProvider>
    <AccountProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <RunningProvider><AppNavigation /></RunningProvider>
      </ThemeProvider>
    </AccountProvider>
  </LanguageProvider>;
}

import type { AuthError } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';

import { useLanguage } from '@/fitness/language';
import { Action, Card, colors, SecondaryButton, styles } from '@/fitness/ui';
import { useAccount } from './account-provider';
import { getAuthClient } from './client';
import { CloudLanguageCard } from './cloud-language-card';

const cooldownSeconds = 60;

type AuthMessage = 'accountRateLimited' | 'accountBadEmail' | 'accountBadCode' |
  'accountSendFailed' | 'accountVerifyFailed' | 'accountSignOutFailed';

function rateLimited(error: AuthError) {
  return error.status === 429 ||
    error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit';
}

export function AccountCard() {
  const { t } = useLanguage();
  const { state, retry } = useAccount();

  return (
    <>
      <Card title={t.accountTitle} icon="profile">
        {state.status === 'disabled' && <Text style={styles.secondary}>{t.accountDisabled}</Text>}
        {state.status === 'loading' && <Text style={styles.secondary}>{t.accountLoading}</Text>}
        {state.status === 'error' && (
          <>
            <Text accessibilityRole="alert" style={styles.secondary}>{t.accountRestoreFailed}</Text>
            <Action label={t.retry} onPress={retry} />
          </>
        )}
        {state.status === 'signedOut' && <SignInForm />}
        {state.status === 'signedIn' && <SignedIn email={state.email} />}
        <Text style={styles.secondary}>{t.accountLocalData}</Text>
      </Card>
      {state.status === 'signedIn' && (
        <CloudLanguageCard key={state.userId} userId={state.userId} />
      )}
    </>
  );
}

function SignInForm() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [destination, setDestination] = useState<string>();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<'sending' | 'verifying'>();
  const [error, setError] = useState<AuthMessage>();
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const operation = useRef(false);

  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [resendAt]);

  function startCooldown() {
    setResendAt(Date.now() + cooldownSeconds * 1000);
    setSeconds(cooldownSeconds);
  }

  async function send() {
    if (operation.current || Date.now() < resendAt) return;
    const address = destination ?? email.trim();
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('accountBadEmail');
      return;
    }
    const client = getAuthClient();
    if (!client) return;
    operation.current = true;
    setPending('sending');
    setError(undefined);
    Keyboard.dismiss();
    try {
      const { error } = await client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
      if (error) {
        if (rateLimited(error)) {
          startCooldown();
          setError('accountRateLimited');
        } else {
          setError(error.code === 'email_address_invalid' ? 'accountBadEmail' : 'accountSendFailed');
        }
        return;
      }
      startCooldown();
      setDestination(address);
      setCode('');
    } catch {
      setError('accountSendFailed');
    } finally {
      operation.current = false;
      setPending(undefined);
    }
  }

  async function verify() {
    if (operation.current || !destination) return;
    const token = code.trim();
    if (!/^\d{6,10}$/.test(token)) {
      setError('accountBadCode');
      return;
    }
    const client = getAuthClient();
    if (!client) return;
    operation.current = true;
    setPending('verifying');
    setError(undefined);
    Keyboard.dismiss();
    try {
      const { data, error } = await client.auth.verifyOtp({ email: destination, token, type: 'email' });
      if (error) {
        setError(rateLimited(error) ? 'accountRateLimited' :
          error.code === 'otp_expired' ? 'accountBadCode' : 'accountVerifyFailed');
      } else if (!data.session) {
        setError('accountVerifyFailed');
      }
    } catch {
      setError('accountVerifyFailed');
    } finally {
      operation.current = false;
      setPending(undefined);
    }
  }

  const waiting = seconds > 0;
  return (
    <>
      <Text style={styles.secondary}>{t[destination ? 'accountCheckInbox' : 'accountSignInIntro']}</Text>
      {destination ? (
        <>
          <Text selectable style={styles.body}>{destination}</Text>
          <View style={styles.inputField}>
            <Text style={styles.body}>{t.accountCode}</Text>
            <TextInput accessibilityLabel={t.accountCode} value={code} onChangeText={setCode}
              editable={!pending} inputMode="numeric" autoComplete="one-time-code"
              maxLength={10} autoCorrect={false} style={styles.input}
              returnKeyType="done" onSubmitEditing={() => { void verify(); }} />
          </View>
        </>
      ) : (
        <View style={styles.inputField}>
          <Text style={styles.body}>{t.accountEmail}</Text>
          <TextInput accessibilityLabel={t.accountEmail} value={email} onChangeText={setEmail}
            editable={!pending} inputMode="email" autoComplete="email" autoCapitalize="none"
            maxLength={254} autoCorrect={false} style={styles.input}
            returnKeyType="go" onSubmitEditing={() => { void send(); }} />
        </View>
      )}
      {error && <Text accessibilityRole="alert" style={styles.secondary}>{t[error]}</Text>}
      {pending ? (
        <Text accessibilityRole="alert" style={styles.secondary}>
          {t[pending === 'sending' ? 'accountSending' : 'accountVerifying']}
        </Text>
      ) : (
        <View style={styles.row}>
          {destination ? (
            <>
              <Action label={t.accountVerify} onPress={() => { void verify(); }} />
              <SecondaryButton label={t.accountResend} disabled={waiting} onPress={() => { void send(); }} />
              <SecondaryButton label={t.accountChangeEmail} onPress={() => {
                setDestination(undefined);
                setCode('');
                setError(undefined);
              }} />
            </>
          ) : waiting ? (
            <SecondaryButton label={t.accountSend} disabled onPress={() => { void send(); }} />
          ) : <Action label={t.accountSend} onPress={() => { void send(); }} />}
        </View>
      )}
      {waiting && <Text style={styles.secondary}>{t.accountResendWait} · {seconds} {t.planSeconds}</Text>}
    </>
  );
}

function SignedIn({ email }: { email: string | null }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const operation = useRef(false);

  async function signOut() {
    const client = getAuthClient();
    if (operation.current || !client) return;
    operation.current = true;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      operation.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Text style={[styles.body, { color: colors.accent }]}>{t.accountSignedIn}</Text>
      {email && <Text selectable style={styles.body}>{email}</Text>}
      {failed && <Text accessibilityRole="alert" style={styles.secondary}>{t.accountSignOutFailed}</Text>}
      {pending ? <Text accessibilityRole="alert" style={styles.secondary}>{t.accountSigningOut}</Text>
        : <SecondaryButton label={t.accountSignOut} onPress={() => { void signOut(); }} />}
    </>
  );
}

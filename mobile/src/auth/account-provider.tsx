import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';

import { accountEnabled, getAuthClient } from './client';

type AccountState =
  | { status: 'disabled' | 'loading' | 'error' | 'signedOut' }
  | { status: 'signedIn'; userId: string; email: string | null };

const AccountContext = createContext<{ state: AccountState; retry: () => void } | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({ status: accountEnabled ? 'loading' : 'disabled' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = getAuthClient();
    if (!client) return;
    let active = true;
    let changed = false;
    function apply(user?: User) {
      if (!active) return;
      setState(user ? { status: 'signedIn', userId: user.id, email: user.email ?? null } : { status: 'signedOut' });
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      changed = true;
      apply(session?.user);
    });

    client.auth.getSession().then(({ data, error }) => {
      if (!active || changed) return;
      if (error) setState({ status: 'error' });
      else apply(data.session?.user);
    }, () => {
      if (active && !changed) setState({ status: 'error' });
    });

    const refresh = (appState: string | null | undefined) => {
      if (appState === 'active' || appState == null) void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    };
    let lifecycle: ReturnType<typeof AppState.addEventListener> | undefined;
    if (Platform.OS !== 'web') {
      lifecycle = AppState.addEventListener('change', refresh);
      refresh(AppState.currentState);
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      lifecycle?.remove();
      if (lifecycle) void client.auth.stopAutoRefresh();
    };
  }, [attempt]);

  return (
    <AccountContext.Provider value={{ state, retry: () => {
      setState({ status: 'loading' });
      setAttempt((value) => value + 1);
    } }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error('AccountProvider is required.');
  return account;
}

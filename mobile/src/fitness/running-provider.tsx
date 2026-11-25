import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { readRunningData, saveRunningData, type RunningData } from './running';

type RunningState = { status: 'loading' | 'failed' } | { status: 'ready'; data: RunningData };
type RunningContextValue = {
  state: RunningState;
  reload: () => void;
  update: (change: (data: RunningData) => RunningData) => Promise<void>;
};
const RunningContext = createContext<RunningContextValue | null>(null);

export function RunningProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RunningState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const current = useRef<RunningData | null>(null);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    void readRunningData().then((data) => {
      if (!live) return;
      current.current = data;
      setState({ status: 'ready', data });
    }, () => { if (live) setState({ status: 'failed' }); });
    return () => { live = false; };
  }, [attempt]);

  const update: RunningContextValue['update'] = useCallback((change) => {
    const next = queue.current.then(async () => {
      if (!current.current) throw new Error('Running data is unavailable');
      const data = change(current.current);
      if (data === current.current) return;
      await saveRunningData(data);
      current.current = data;
      setState({ status: 'ready', data });
    });
    queue.current = next.catch(() => {});
    return next;
  }, []);

  return <RunningContext.Provider value={{ state, update, reload: () => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  } }}>{children}</RunningContext.Provider>;
}

export function useRunning() {
  const context = useContext(RunningContext);
  if (!context) throw new Error('RunningProvider is missing');
  return context;
}

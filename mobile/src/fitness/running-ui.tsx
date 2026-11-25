import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { playHaptic } from './haptics';
import { Pressable } from './pressable';

import { localDay } from './calendar';
import { useLanguage } from './language';
import { RunRouteCard } from './run-route-card';
import { durationText, isRunDone, mondayOf, type RunEntry, type RunningData } from './running';
import { useRunning } from './running-provider';
import { Action, Card, colors, SecondaryButton, styles } from './ui';

export function RunShortcut({ today }: { today: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { state } = useRunning();
  const data = state.status === 'ready' ? state.data : undefined;
  const task = data?.tasks.find((item) => item.day === today && !isRunDone(item, data.history));
  return <Card title={t.runTitle} icon="run">
    {!!task && !data?.active && <Text style={styles.body}>{t.runEasy} · {task.minutes} {t.planMinutes}</Text>}
    <Action label={t[data?.active ? 'runResume' : 'runStart']} icon="arrow"
      onPress={() => router.push({ pathname: '/running', params: { mode: 'start' } })} />
  </Card>;
}

export function RunWeek({ today }: { today: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { state, update, reload } = useRunning();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = mondayOf(today);
  const data = state.status === 'ready' ? state.data : undefined;
  const tasks = data?.tasks.filter((task) => task.day >= start) ?? [];

  function toggle(day: string, checked: boolean) {
    setSaving(true);
    setFailed(false);
    let changed = false;
    void update((current) => {
      if (current.active?.taskDay === day || current.history.some((entry) => entry.taskDay === day)
        || !current.tasks.some((task) => task.day === day && task.checked === checked)) return current;
      changed = true;
      return { ...current, tasks: current.tasks.map((task) => task.day === day ? { ...task, checked: !checked } : task) };
    }).then(() => {
      if (changed) playHaptic(checked ? 'selection' : 'success');
    }, () => {
      setFailed(true);
      playHaptic('error');
    }).finally(() => setSaving(false));
  }

  return <Card title={t.runPlan} icon="run">
    <SecondaryButton label={t.runPlanAdd} icon="plus" onPress={() => router.push({ pathname: '/running', params: { mode: 'plan' } })} />
    {state.status === 'failed' && <SecondaryButton label={t.retry} onPress={reload} />}
    {failed && <Text accessibilityRole="alert" style={styles.secondary}>{t.runSaveFailed}</Text>}
    {tasks.map((task) => {
      const measured = data?.history.some((entry) => entry.taskDay === task.day);
      const done = task.checked || measured;
      const running = data?.active?.taskDay === task.day;
      return <View key={task.day} style={styles.row}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.day} · ${t.runEasy}`}
          aria-checked={Boolean(done)} accessibilityState={{ checked: Boolean(done), disabled: Boolean(saving || measured || running) }}
          disabled={Boolean(saving || measured || running)} onPress={() => toggle(task.day, task.checked)} style={styles.choice}>
          <Text style={done ? styles.selectedChoiceLabel : styles.body}>
            {done ? '✓' : '○'} {task.day.slice(5)} · {task.minutes} {t.planMinutes}
          </Text>
        </Pressable>
        {(!data?.active || running) && !done && <SecondaryButton label={t[running ? 'runResume' : 'runStart']}
          onPress={() => router.push({ pathname: '/running', params: { mode: 'start', day: task.day } })} />}
        {!running && !done && <SecondaryButton label={t.runPlanEdit}
          onPress={() => router.push({ pathname: '/running', params: { mode: 'plan', day: task.day } })} />}
      </View>;
    })}
  </Card>;
}

export function RunHistoryList({ history }: { history: RunEntry[] }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(8);
  const [route, setRoute] = useState<number>();
  return <Card title={t.runHistory} icon="run">
    {history.length === 0 && <Text style={styles.secondary}>{t.runHistoryEmpty}</Text>}
    {history.slice(0, visible).map((run) => (
      <View style={runStyles.item} key={run.startedAt}>
        <Text style={styles.body}>{localDay(new Date(run.startedAt))} · {durationText(run.elapsed)}</Text>
        {run.km !== undefined && <Text style={styles.secondary}>
          {run.km} km · {durationText(Math.round(run.elapsed / run.km / 1000) * 1000)} /km
          {run.gpsDistance ? ` · ${t.runGpsDistance}` : ''}
        </Text>}
        <SecondaryButton label={t.shareCheckIn} onPress={() => router.push({
          pathname: '/training-share', params: { run: String(run.startedAt) },
        })} />
        {run.gps && <SecondaryButton label={t.runGpsRoute}
          onPress={() => setRoute(route === run.startedAt ? undefined : run.startedAt)} />}
        {route === run.startedAt && <RunRouteCard key={run.startedAt} id={run.startedAt} />}
      </View>
    ))}
    {visible < history.length && <SecondaryButton label={t.workoutMore} onPress={() => setVisible(visible + 8)} />}
  </Card>;
}

export function RunWeekSummary({ data, start, end }: { data: RunningData; start: string; end: string }) {
  const { t } = useLanguage();
  const isInWeek = (day: string) => day >= start && day <= end;
  const tasks = data.tasks.filter((task) => isInWeek(task.day));
  const runs = data.history.filter((run) => isInWeek(localDay(new Date(run.startedAt))));
  const sum = runs.reduce((total, run) => total + (run.km ?? 0), 0);
  return <Card title={t.runTitle} icon="run">
    <Text style={styles.body}>{t.runPlanDone} · {tasks.filter((task) => isRunDone(task, data.history)).length} / {tasks.length}</Text>
    <Text style={styles.body}>{t.runHistory} · {runs.length} · {durationText(runs.reduce((total, run) => total + run.elapsed, 0))}</Text>
    {sum > 0 && <Text style={styles.secondary}>{t.runKnownDistance} · {Number(sum.toFixed(2))} km</Text>}
  </Card>;
}

const runStyles = StyleSheet.create({
  item: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10, gap: 6 },
});

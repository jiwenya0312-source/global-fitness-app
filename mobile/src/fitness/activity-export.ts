import { localDay, shiftDay } from './calendar';
import type { useLanguage } from './language';
import type { BodyProfile } from './profile';
import { durationText, type RunEntry, type RunTask } from './running';
import {
  displaySetWeight, newSession, plannedGroupDone, recommendSet, weightLabel, workingSets, workingSetTarget,
  type RecordedSet, type WorkoutSession,
} from './workout-log';
import { exerciseRest, exerciseSeconds, type PlanRevision } from './workout-plan';

type Copy = ReturnType<typeof useLanguage>['t'];
export type ActivityRow = {
  day: string;
  kind: 'strength' | 'warmup' | 'run';
  name: string;
  group: string;
  load: string;
  target: string;
  rest: string;
  status: 'exportPending' | 'exportConfirmed' | 'exportRecorded';
  actual: string;
  notes: string;
};

function weight(set: RecordedSet, units: BodyProfile['units']) {
  return set.weightKg === null ? '' : `${displaySetWeight(set.weightKg, units)} ${weightLabel(units)}`;
}

function actual(set: RecordedSet, units: BodyProfile['units'], t: Copy) {
  return [weight(set, units), set.seconds === undefined ? `${set.reps} ${t.reps}` : `${set.seconds} ${t.planSeconds}`]
    .filter(Boolean).join(' × ');
}

export function strengthRows(session: WorkoutSession, history: WorkoutSession[], t: Copy, profile?: BodyProfile) {
  const day = session.planDay ?? localDay(new Date(session.startedAt));
  const target = workingSetTarget(session);
  const baseline = { ...session, sets: session.sets.map(() => []), selectedExercises: undefined, equipmentChanges: undefined };
  const prior = history.filter((record) => record.endedAt && record.endedAt <= session.startedAt);
  return session.schedule.exercises.flatMap(({ name }, slot) => {
    const sets = session.sets[slot] ?? [];
    const formal = workingSets(sets);
    const seconds = exerciseSeconds(name);
    const load = profile ? weight(recommendSet(baseline, slot, prior, profile).value, session.units) : '';
    const warmup = sets.filter((set) => set.kind === 'warmup').map((set, index): ActivityRow => ({
      day, kind: 'warmup', name: t[set.exercise], group: `${t.exportGroupWarmup} ${index + 1}`,
      load: '', target: '', rest: `45 ${t.planSeconds}`, status: 'exportRecorded',
      actual: actual(set, session.units, t), notes: set.notes,
    }));
    return [...warmup, ...Array.from({ length: Math.max(target, formal.length) }, (_, index): ActivityRow => {
      const recorded = formal[index];
      return {
        day, kind: 'strength', name: t[name], group: `${t.exportGroupFormal} ${index + 1}`,
        target: index >= target ? '' : seconds ? `${seconds} ${t.planSeconds}` : `${session.minReps}–${session.maxReps} ${t.reps}`,
        load: index < target ? load : '', rest: `${exerciseRest(name)} ${t.planSeconds}`,
        status: recorded ? 'exportRecorded' : plannedGroupDone(session, slot, index) ? 'exportConfirmed' : 'exportPending',
        actual: recorded ? [recorded.exercise !== name ? t[recorded.exercise] : '', actual(recorded, session.units, t)]
          .filter(Boolean).join(' · ') : '',
        notes: recorded?.notes ?? '',
      };
    })];
  });
}

export function runRow(task: RunTask | undefined, run: RunEntry | undefined, t: Copy): ActivityRow {
  const pace = run?.km ? durationText(Math.round(run.elapsed / run.km / 1000) * 1000) : '';
  return {
    day: task?.day ?? localDay(new Date(run!.startedAt)), kind: 'run', name: t[task ? 'runEasy' : 'runTitle'],
    group: t.runTitle, load: '', rest: '', target: task ? `${task.minutes} ${t.planMinutes}` : '',
    status: run ? 'exportRecorded' : task?.checked ? 'exportConfirmed' : 'exportPending',
    actual: run ? [durationText(run.elapsed), run.km && `${run.km} km`, pace && `${pace} /km`].filter(Boolean).join(' · ') : '',
    notes: '',
  };
}

export function planRows({ plan, profile, history, tasks, runs, from, through, today, t }: {
  plan: PlanRevision | null; profile?: BodyProfile; history: WorkoutSession[];
  tasks: RunTask[]; runs: RunEntry[]; from: string; through: string; today: string; t: Copy;
}) {
  const rows: ActivityRow[] = [];
  if (plan && profile) {
    const mount = new Date(`${today}T23:59:59`).toISOString();
    for (let day = from; day <= through; day = shiftDay(day, 1)) {
      const weekday = new Date(`${day}T12:00:00`).getDay();
      if (!plan.plan.sessions.some((session) => session.day === weekday)) continue;
      const existing = history.find((record) => record.planSavedAt === plan.savedAt && record.schedule.day === weekday
        && (record.planDay ?? (record.endedAt ? localDay(new Date(record.endedAt)) : localDay(new Date(record.startedAt)))) === day);
      const draft = newSession(plan, weekday, profile.units, mount, { planDay: day });
      rows.push(...strengthRows(existing ?? { ...draft, id: 0 }, history, t, profile));
    }
  }
  for (const task of tasks.filter(({ day }) => day >= from && day <= through)) {
    rows.push(runRow(task, runs.find((item) => item.taskDay === task.day), t));
  }
  return rows.sort((left, right) => left.day.localeCompare(right.day));
}

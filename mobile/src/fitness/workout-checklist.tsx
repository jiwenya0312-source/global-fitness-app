import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { playHaptic, type HapticFeedback } from './haptics';
import { Pressable } from './pressable';

import { useLanguage } from './language';
import type { BodyProfile } from './profile';
import { Action, Card, Page, SecondaryButton, styles, Track } from './ui';
import {
  activeExercise, displaySetWeight, hasWorkoutRecords, plannedGroupDone, plannedWorkoutProgress, recommendSet,
  weightLabel, workingSets, workingSetTarget, type WorkoutSession,
} from './workout-log';
import { exerciseRest, exerciseSeconds } from './workout-plan';
import { RestClock, timerDeadline, useCountdown } from './workout-session';
import { discardEmptyWorkout, updateWorkout } from './workout-store';

export function WorkoutChecklist({ session, history, profile, onChanged, onReload }: {
  session: WorkoutSession; history: WorkoutSession[]; profile?: BodyProfile;
  onChanged: (record: WorkoutSession | null) => void; onReload: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'workoutInAnotherView' | 'workoutWriteFailed'>();
  const [confirm, setConfirm] = useState(false);
  const pending = useRef(false);
  const target = workingSetTarget(session);
  const groups = Array.from({ length: target }, (_, index) => index);
  const { total, done } = plannedWorkoutProgress(session);
  const rest = useCountdown(session.restUntil);
  const hasRecords = hasWorkoutRecords(session);
  const blocked = busy || error === 'workoutInAnotherView';

  async function save(next: WorkoutSession | null, feedback?: HapticFeedback) {
    if (pending.current || error === 'workoutInAnotherView') return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (next) {
        const record = await updateWorkout(next);
        if (!record) {
          setError('workoutInAnotherView');
          playHaptic('error');
        } else {
          if (feedback) playHaptic(feedback);
          onChanged(record);
        }
      } else if (await discardEmptyWorkout(session)) {
        onChanged(null);
      } else {
        setError('workoutInAnotherView');
        playHaptic('error');
      }
    } catch {
      setError('workoutWriteFailed');
      playHaptic('error');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function toggle(slot: number, index: number, isChecked: boolean) {
    if (!isChecked && rest) return;
    const checkedSets = session.schedule.exercises.map((_, position) => {
      const previous = session.checkedSets?.[position] ?? [];
      if (position !== slot) return previous;
      return isChecked ? previous.filter((set) => set !== index) : [...previous, index];
    });
    void save({ ...session, checkedSets, restUntil: isChecked ? null : timerDeadline(exerciseRest(activeExercise(session, slot))) },
      isChecked ? 'selection' : 'success');
  }

  return <Page title={t.checkTitle} icon="workout" footer={session.restUntil !== null && <RestClock
    seconds={rest} disabled={blocked} skip={() => { void save({ ...session, restUntil: null }, 'selection'); }}
    extend={() => { void save({ ...session, restUntil: timerDeadline(30, session.restUntil ?? 0) }, 'selection'); }} />}>
    <Card title={t.workoutInProgress} icon="calendar" tone="accent">
      <Text style={styles.headline}>{done} / {total} {t.sets}</Text>
      <Track target={total} value={done} />
      <Text style={styles.secondary}>{t.checkHint}</Text>
      <SecondaryButton label={t.checkDetailed} disabled={blocked} onPress={() => { void save({ ...session, checklist: false }); }} />
      {error && <Text accessibilityRole="alert" style={styles.secondary}>{t[error]}</Text>}
      {error === 'workoutInAnotherView' && <SecondaryButton label={t.retry} onPress={onReload} />}
    </Card>
    {session.schedule.exercises.map((_, slot) => {
      const exercise = activeExercise(session, slot);
      const plannedSeconds = exerciseSeconds(exercise);
      const recorded = workingSets(session.sets[slot]);
      const suggested = recommendSet(session, slot, history, profile).value;
      const numbers = plannedSeconds ? `${plannedSeconds} ${t.planSeconds}` : `${session.minReps}–${session.maxReps} ${t.reps}`;
      return <Card key={slot} title={t[exercise]}>
        <Text style={styles.secondary}>
          {suggested.weightKg === null ? '' : `${displaySetWeight(suggested.weightKg, session.units)} ${weightLabel(session.units)} · `}
          {numbers} · {t.planRest} {exerciseRest(exercise)} {t.planSeconds}
        </Text>
        <View style={styles.row}>
          {groups.map((index) => {
            const checked = plannedGroupDone(session, slot, index);
            const disabled = blocked || index < recorded.length || (rest > 0 && !checked);
            return <Pressable key={index} accessibilityRole="checkbox"
              accessibilityLabel={`${t[exercise]} · ${t.sets} ${index + 1}`}
              aria-checked={checked} accessibilityState={{ checked, disabled }} disabled={disabled}
              style={[styles.choice, checked && styles.selectedChoice, disabled && !checked && styles.disabled]}
              onPress={() => toggle(slot, index, checked)}>
              <Text style={checked ? styles.selectedChoiceLabel : styles.body}>{checked ? '✓' : '○'} {index + 1}</Text>
            </Pressable>;
          })}
        </View>
      </Card>;
    })}
    <Card title={t.workoutEndTitle}>
      {confirm && <Text style={styles.secondary}>{t[hasRecords ? done === total ? 'workoutFinishConfirm' : 'checkPartialConfirm' : 'workoutDiscardConfirm']}</Text>}
      <View style={styles.row}>
        <Action label={t[hasRecords ? done === total ? 'workoutFinish' : 'checkSavePartial' : 'workoutDiscard']} disabled={blocked}
          onPress={() => {
            if (!confirm) setConfirm(true);
            else void save(hasRecords ? { ...session, endedAt: new Date().toISOString(), restUntil: null } : null, 'success');
          }} />
        {confirm && <SecondaryButton label={t.profileCancel} disabled={blocked} onPress={() => setConfirm(false)} />}
      </View>
    </Card>
  </Page>;
}

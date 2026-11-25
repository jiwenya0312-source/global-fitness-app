import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { playHaptic } from './haptics';
import { Pressable } from './pressable';

import { exerciseGuides, exerciseOptions } from './exercise-guide';
import { useLanguage } from './language';
import type { BodyProfile } from './profile';
import { Action, Card, Choice, colors, Page, SecondaryButton, styles, Track } from './ui';
import {
  activeExercise, countCheckOnly, countSets, countWarmupSets, displaySetWeight, nextWorkingMovement, parseSet, recommendSet,
  warmupSet, weekdays, weightLabel, workingSets, workingSetTarget, type RecordedSet, type SetEffort, type WorkoutSession,
} from './workout-log';
import { exerciseRest, exerciseSeconds, type Exercise } from './workout-plan';
import { discardEmptyWorkout, updateWorkout } from './workout-store';

type EditingSet = { movement: number; index: number };

export function timerDeadline(seconds: number, previous = 0) {
  return Math.max(Date.now(), previous) + seconds * 1000;
}

function completedHold(deadline: number, target: number) {
  return Math.min(target, Math.floor((Date.now() - deadline + target * 1000) / 1000));
}

export function ActiveWorkout({ session, history, profile, onChanged, onReload, onChecklist }: {
  session: WorkoutSession;
  history: WorkoutSession[];
  profile?: BodyProfile;
  onChanged: (session: WorkoutSession | null) => void;
  onReload: () => void;
  onChecklist?: () => void;
}) {
  const { language, t } = useLanguage();
  const [editing, setEditing] = useState<EditingSet | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [panel, setPanel] = useState<'substitutions' | 'guide'>();
  const [isWarmup, setIsWarmup] = useState(false);
  const [effort, setEffort] = useState<SetEffort>();
  const [weightOverride, setWeightOverride] = useState<number>();
  const [repsOverride, setRepsOverride] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [recentGroup, setRecentGroup] = useState<EditingSet>();
  const [beforeLastSet, setBeforeLastSet] = useState<Pick<WorkoutSession, 'sets' | 'selectedExercises' | 'checkedSets'>>();
  const [error, setError] = useState<'workoutWriteFailed' | 'workoutInAnotherView'>();
  const pending = useRef(false);
  const restSeconds = useCountdown(session.restUntil);
  const resting = restSeconds > 0;
  const total = countSets(session);
  const warmups = countWarmupSets(session);
  const checked = countCheckOnly(session);
  const hasRecords = total + warmups + checked > 0;
  const target = workingSetTarget(session);
  const movement = nextWorkingMovement(session);
  const suggestion = movement >= 0 ? recommendSet(session, movement, history, profile) : null;
  const current = movement >= 0 ? session.sets[movement].length : 0;
  const measured = movement >= 0 ? workingSets(session.sets[movement]).length : 0;
  const working = measured + (session.checkedSets?.[movement]?.filter((index) => index >= measured && index < target).length ?? 0);
  const hold = session.setUntil?.movement === movement ? session.setUntil : undefined;
  const doingWarmup = hold ? hold.warmup === true : isWarmup;
  const planned = target * session.schedule.exercises.length;
  const canProgress = session.schedule.exercises.some((_, index) => recommendSet(session, index, history, profile).canProgress);

  function resetSetControls() {
    setEffort(undefined);
    setWeightOverride(undefined);
    setRepsOverride(undefined);
  }

  async function persist(next: WorkoutSession | null, clearSetControls = false, onSaved?: () => void) {
    if (pending.current || error === 'workoutInAnotherView') return;
    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const result = next ? await updateWorkout(next) : await discardEmptyWorkout(session);
      if (!result) {
        setError('workoutInAnotherView');
        playHaptic('error');
        return;
      }
      Keyboard.dismiss();
      if (clearSetControls) {
        resetSetControls();
        setIsWarmup(false);
        setPanel(undefined);
      }
      setEditing(null);
      setConfirmEnd(false);
      onSaved?.();
      onChanged(typeof result === 'boolean' ? null : result);
    } catch {
      setError('workoutWriteFailed');
      playHaptic('error');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function recordSet({ movement, index }: EditingSet, value: RecordedSet | null) {
    const isNew = index === session.sets[movement].length;
    if (isNew && resting) return;
    const sets = session.sets.map((records, position) => {
      if (position !== movement) return records;
      if (value === null) return records.filter((_, row) => row !== index);
      const updated = [...records];
      updated[index] = value;
      return updated;
    });
    const checkedSets = isNew && value && value.kind !== 'warmup' && session.checkedSets
      ? session.checkedSets.map((entries, slot) => slot === movement
        ? entries.filter((entry) => entry >= workingSets(session.sets[slot]).length)
          .map((_, offset) => workingSets(session.sets[slot]).length + 1 + offset)
        : entries)
      : session.checkedSets;
    const remaining = sets.reduce((count, records) => count + records.length, 0);
    const restUntil = isNew && value ? timerDeadline(value.kind === 'warmup' ? 45 : exerciseRest(value.exercise))
      : remaining ? session.restUntil : null;
    const selectedExercises = isNew && value && value.kind !== 'warmup'
      ? { ...session.selectedExercises, [movement]: value.exercise } : session.selectedExercises;
    void persist({ ...session, sets, restUntil, selectedExercises, checkedSets,
      setUntil: isNew && session.setUntil?.movement === movement ? undefined : session.setUntil }, isNew,
    () => {
      setRecentGroup(isNew && value && value.kind !== 'warmup' ? { movement, index } : undefined);
      setBeforeLastSet(isNew && value ? { sets: session.sets, selectedExercises: session.selectedExercises, checkedSets: session.checkedSets } : undefined);
      playHaptic(value ? 'success' : 'selection');
    });
  }

  const blocked = saving || error === 'workoutInAnotherView';
  const nextSet = suggestion ? doingWarmup ? warmupSet(suggestion.value, suggestion.step) : suggestion.value : undefined;
  const load = weightOverride ?? nextSet?.weightKg ?? null;
  const repetitions = repsOverride ?? nextSet?.reps ?? 1;
  const guidance = nextSet ? exerciseGuides[nextSet.exercise] : undefined;
  const machine = guidance?.equipment === 'gymMachines';
  const plannedExercise = session.schedule.exercises[movement];
  const options = plannedExercise ? exerciseOptions(plannedExercise.name, plannedExercise.alternative, nextSet?.exercise) : [];
  const secondsTarget = hold?.targetSeconds ?? nextSet?.seconds;
  const lighterStart = suggestion?.reason === 'workoutAfterBreak' || suggestion?.reason === 'workoutFromLightMode';

  function extendRest() {
    void persist({ ...session, restUntil: timerDeadline(30, session.restUntil ?? 0) }, false, () => playHaptic('selection'));
  }

  function finishCurrentSet(value: RecordedSet) {
    if (resting) return;
    if (secondsTarget && !hold) {
      void persist({ ...session, restUntil: null, setUntil: { movement, deadline: timerDeadline(secondsTarget),
        targetSeconds: secondsTarget, warmup: doingWarmup } }, false, () => playHaptic('selection'));
      return;
    }
    const seconds = hold && secondsTarget ? completedHold(hold.deadline, secondsTarget) : undefined;
    if (seconds !== undefined && seconds < 1) return;
    recordSet({ movement, index: current }, { ...value, weightKg: load, reps: repetitions, effort, seconds });
  }

  function checkCurrentGroup() {
    if (resting || !nextSet || hold || doingWarmup) return;
    const checkedSets = session.sets.map((_, slot) => {
      const entries = session.checkedSets?.[slot] ?? [];
      if (slot !== movement) return entries;
      const index = Array.from({ length: target }, (_, row) => row)
        .find((row) => row >= measured && !entries.includes(row));
      return index === undefined ? entries : [...entries, index];
    });
    void persist({ ...session, checkedSets, restUntil: timerDeadline(exerciseRest(nextSet.exercise)) }, true, () => {
      setRecentGroup(undefined);
      setBeforeLastSet({ sets: session.sets, selectedExercises: session.selectedExercises, checkedSets: session.checkedSets });
      playHaptic('success');
    });
  }

  function swapExercise(exercise: Exercise) {
    if (hold || !nextSet || exercise === nextSet.exercise) {
      setPanel(undefined);
      return;
    }
    const equipmentChanges = session.differentEquipment?.includes(movement)
      ? [...new Set([...(session.equipmentChanges ?? []), nextSet.exercise])] : session.equipmentChanges;
    void persist({ ...session,
      selectedExercises: { ...session.selectedExercises, [movement]: exercise },
      equipmentChanges,
      differentEquipment: session.differentEquipment?.filter((slot) => slot !== movement),
    }, true, () => setBeforeLastSet(undefined));
  }

  return (
    <Page title={t.workout} icon="workout" footer={session.restUntil !== null || beforeLastSet ? (
      <View style={sessionStyles.rest}>
        {session.restUntil !== null && <RestClock seconds={restSeconds} disabled={blocked || Boolean(editing)}
          extend={extendRest} skip={() => { void persist({ ...session, restUntil: null }, false, () => playHaptic('selection')); }} />}
        {resting && recentGroup && session.sets[recentGroup.movement]?.[recentGroup.index] && !editing && <View style={styles.row}>
          <Text style={styles.secondary}>{language === 'zh' ? '这组感觉' : 'How was that set?'}</Text>
          {(['effortLight', 'effortRight', 'effortHeavy'] as const).map((option) => (
            <Choice key={option} label={t[option]} disabled={blocked}
              selected={session.sets[recentGroup.movement][recentGroup.index].effort === option}
              onPress={() => {
                const sets = session.sets.map((entries, slot) => slot === recentGroup.movement
                  ? entries.map((entry, row) => row === recentGroup.index ? { ...entry, effort: option } : entry)
                  : entries);
                void persist({ ...session, sets });
              }} />
          ))}
        </View>}
        {beforeLastSet && <SecondaryButton label={t.workoutUndoSet} disabled={blocked || Boolean(editing) || Boolean(hold)}
          onPress={() => {
            void persist({ ...session, ...beforeLastSet, restUntil: null }, true, () => {
              setBeforeLastSet(undefined);
              setRecentGroup(undefined);
            });
          }} />}
      </View>
    ) : undefined}>
      <Card title={t.workoutInProgress} icon="workout">
        <Text style={styles.headline}>{t[session.schedule.focus ?? 'balanced']}</Text>
        <Text style={styles.secondary}>{total} / {planned} {t.workoutSetsLogged} · {t[session.mode ?? 'steadyMode']}</Text>
        {checked > 0 && <Text style={styles.secondary}>{t.checkOnly} · {checked}</Text>}
        {onChecklist && !hold && !editing && <SecondaryButton label={t.checkTitle} disabled={blocked} onPress={onChecklist} />}
        {warmups > 0 && <Text style={styles.secondary}>{t.workoutWarmupCount} {warmups}</Text>}
        <Track value={total + checked} target={planned} />
        {total === 0 && !session.setUntil && session.mode === undefined && <View style={styles.row}>
          {(['steadyMode', 'progressMode', 'lightMode'] as const).map((mode) => (
            <Choice key={mode} label={t[mode]} selected={(session.mode ?? 'steadyMode') === mode}
                disabled={blocked || resting || (mode === 'progressMode' && !canProgress)}
              onPress={() => { void persist({ ...session, mode }, true); }} />
          ))}
        </View>}
        {total === 0 && !canProgress && <Text style={styles.secondary}>{t.workoutProgressHint}</Text>}
      </Card>
      {error && (
        <Card title={t.workoutSaveStatus}>
          <Text accessibilityRole="alert" style={styles.secondary}>{t[error]}</Text>
          {error === 'workoutInAnotherView' && <Action label={t.retry} onPress={onReload} />}
        </Card>
      )}
      {suggestion && nextSet && guidance && !editing && (
          <Card title={t[nextSet.exercise]} icon="workout" tone="accent">
            <View style={sessionStyles.workType}>
              <Text style={sessionStyles.link}>{doingWarmup ? t.workoutWarmupSet
                : `${t.workoutWorkingSet} ${working + 1} / ${target}`}</Text>
              {!hold && <SecondaryButton label={t[doingWarmup ? 'workoutBackToWorking' : 'workoutLogWarmup']}
                disabled={blocked} onPress={() => {
                  resetSetControls();
                  setIsWarmup(!doingWarmup);
                }} />}
            </View>
            <Text style={sessionStyles.amount}>
              {load === null ? t[machine ? lighterStart ? 'workoutMachineLighter' : 'workoutMachineStart'
                : guidance.equipment === 'bodyweight' ? 'bodyweight' : 'workoutUnweighted']
                : `${displaySetWeight(load, session.units)} ${weightLabel(session.units)}`}
              {' × '}{secondsTarget ?? repetitions} {t[secondsTarget ? 'planSeconds' : 'reps']}
            </Text>
            <Text style={styles.secondary}>{guidance.equipment === 'dumbbells' && load !== null ? `${t.workoutPerDumbbell} · ` : ''}
              {t[doingWarmup ? 'workoutWarmupHint' : suggestion.reason]}</Text>
            {!hold && (load !== null || !nextSet.seconds) && <View style={styles.row}>
              {load !== null && <>
                <SecondaryButton label={t.workoutLower} disabled={blocked || load === 0}
                  onPress={() => setWeightOverride(Math.max(0, load - suggestion.step))} />
                <SecondaryButton label={t.workoutRaise} disabled={blocked || load === 1000}
                  onPress={() => setWeightOverride(Math.min(1000, load + suggestion.step))} />
              </>}
              {!nextSet.seconds && <>
                <SecondaryButton label={t.workoutLowerReps} disabled={blocked || repetitions === 1}
                  onPress={() => setRepsOverride(repetitions - 1)} />
                <SecondaryButton label={t.workoutRaiseReps} disabled={blocked || repetitions === 999}
                  onPress={() => setRepsOverride(repetitions + 1)} />
              </>}
            </View>}
            {hold && <HoldClock key={hold.deadline} deadline={hold.deadline} />}
            <View style={styles.row}>
              {(['effortLight', 'effortRight', 'effortHeavy'] as const).map((option) => (
                <Choice key={option} label={t[option]} selected={effort === option} disabled={blocked}
                  onPress={() => setEffort(effort === option ? undefined : option)} />
              ))}
            </View>
            <Action label={t[resting ? 'workoutResting' : secondsTarget && !hold ? 'workoutStartHold'
              : doingWarmup ? 'workoutCompleteWarmup' : 'workoutQuickComplete']} full disabled={blocked || resting}
              onPress={() => finishCurrentSet(nextSet)} />
            {!hold && !doingWarmup && <SecondaryButton label={language === 'zh' ? '只勾选完成' : 'Mark complete only'}
              disabled={blocked || resting} onPress={checkCurrentGroup} />}
            {hold && <SecondaryButton label={t.workoutCancelHold} disabled={blocked}
              onPress={() => { void persist({ ...session, setUntil: undefined }); }} />}
            {!hold && <View style={styles.row}>
              <SecondaryButton label={t.workoutSetDetails} disabled={blocked || resting} onPress={() => {
                setConfirmEnd(false);
                setEditing({ movement, index: current });
              }} />
              {options.length > 1 && working === 0 && <SecondaryButton label={language === 'zh' ? '器械占用 · 换动作' : 'Equipment busy? Swap exercise'} disabled={blocked}
                onPress={() => setPanel(panel === 'substitutions' ? undefined : 'substitutions')} />}
              <SecondaryButton label={t.workoutGuide} disabled={blocked}
                onPress={() => setPanel(panel === 'guide' ? undefined : 'guide')} />
            </View>}
            {panel === 'substitutions' && !hold && (
              <View style={sessionStyles.guide}>
                <Text style={styles.secondary}>{t.workoutSwapHint}</Text>
                <View style={styles.row}>
                  {options.map((option) => (
                    <Choice key={option} label={`${t[option]} · ${t[exerciseGuides[option].equipment]}`}
                      selected={option === nextSet.exercise} disabled={blocked || working > 0} onPress={() => swapExercise(option)} />
                  ))}
                </View>
              </View>
            )}
            {panel === 'guide' && (
              <View style={sessionStyles.guide}>
                <Text style={styles.body}>{t[guidance.cue]}</Text>
                {suggestion.matched && <Text style={styles.secondary}>{t.workoutLastWorkingSet} · {
                  setSummary(suggestion.matched, session.units, t)
                }</Text>}
                {machine && suggestion.matched && working === 0 && !hold &&
                  <SecondaryButton label={t.workoutSwitchGear} disabled={blocked} onPress={() => {
                    void persist({ ...session,
                      equipmentChanges: [...new Set([...(session.equipmentChanges ?? []), nextSet.exercise])],
                    }, true);
                  }} />}
              </View>
            )}
          </Card>
      )}
      <SecondaryButton label={t[showLog ? 'workoutHideDetails' : 'workoutSessionLog']} disabled={Boolean(editing)}
        onPress={() => setShowLog(!showLog)} />
      {session.schedule.exercises.map(({ name, alternative }, slot) => {
        if (!showLog && editing?.movement !== slot) return null;
        const sets = session.sets[slot];
        const active = editing?.movement === slot;
        const selected = activeExercise(session, slot);
        const seconds = exerciseSeconds(selected);
        return (
          <Card key={`${slot}-${name}`} title={t[selected]}>
            <Text style={styles.secondary}>{t.workoutTarget} · {target} {t.sets} × {
              seconds ? `${seconds} ${t.planSeconds}` : `${session.minReps}–${session.maxReps} ${t.reps}`
            }</Text>
            {sets.map((set, index) => (
              <Pressable key={index} accessibilityRole="button" disabled={blocked || Boolean(editing) || Boolean(hold)}
                accessibilityLabel={`${t.workoutEditSet} ${index + 1} · ${t[set.exercise]}`}
                onPress={() => { setConfirmEnd(false); setEditing({ movement: slot, index }); }}
                style={sessionStyles.row}>
                <SetLine set={set} index={index} units={session.units} />
                <Text style={sessionStyles.link}>{t.workoutEditSet}</Text>
              </Pressable>
            ))}
            {active ? (
              <SetForm key={editing.index} session={session} movement={slot}
                initial={sets[editing.index] ?? (slot === movement && nextSet
                  ? { ...nextSet, weightKg: load, reps: repetitions }
                  : recommendSet(session, slot, history, profile).value)}
                existing={editing.index < sets.length} disabled={blocked || (resting && editing.index === sets.length)}
                options={exerciseOptions(name, alternative, selected)}
                onSave={(value) => recordSet(editing, value)} onCancel={() => setEditing(null)} />
            ) : !blocked && !editing && !hold && (
              <Action label={t.workoutAddSet} icon="plus" disabled={resting} onPress={() => {
                setConfirmEnd(false);
                setEditing({ movement: slot, index: sets.length });
              }} />
            )}
          </Card>
        );
      })}
      {!editing && !blocked && (
        <Card title={t.workoutEndTitle}>
          {confirmEnd ? (
            <>
              <Text style={styles.secondary}>{t[hasRecords ? 'workoutFinishConfirm' : 'workoutDiscardConfirm']}</Text>
              <View style={styles.row}>
                <Action label={t[hasRecords ? 'workoutFinish' : 'workoutDiscard']} onPress={() => {
                  void persist(hasRecords ? { ...session, endedAt: new Date().toISOString(), restUntil: null, setUntil: undefined } : null, false,
                    () => playHaptic(hasRecords ? 'success' : 'selection'));
                }} />
                <Secondary label={t.profileCancel} onPress={() => setConfirmEnd(false)} />
              </View>
            </>
          ) : <Action label={t[hasRecords ? 'workoutFinish' : 'workoutDiscard']} onPress={() => setConfirmEnd(true)} />}
        </Card>
      )}
      {!blocked && <Card title={language === 'zh' ? '训练中不适' : 'Discomfort during training'}>
        {confirmStop ? <>
          <Text accessibilityRole="alert" style={styles.secondary}>{language === 'zh'
            ? '停止训练并保留已记录的组。此次训练不会作为加重依据。'
            : 'End the workout and keep recorded sets. This workout will not support a weight increase.'}</Text>
          <Action label={language === 'zh' ? '停止并保存' : 'Stop and save'} onPress={() => {
            void persist(hasRecords ? { ...session, stoppedForPain: true, endedAt: new Date().toISOString(),
              restUntil: null, setUntil: undefined } : null);
          }} />
          <SecondaryButton label={t.profileCancel} onPress={() => setConfirmStop(false)} />
        </> : <SecondaryButton label={language === 'zh' ? '出现异常疼痛' : 'Report unusual pain'} onPress={() => setConfirmStop(true)} />}
      </Card>}
      {saving && <Text accessibilityRole="alert" style={styles.secondary}>{t.profileSaving}</Text>}
    </Page>
  );
}

function remainingSeconds(deadline: number | null) {
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function useCountdown(deadline: number | null) {
  const [snapshot, setSnapshot] = useState(() => ({ deadline, seconds: remainingSeconds(deadline) }));

  useEffect(() => {
    if (deadline === null || deadline <= Date.now()) return;
    let notified = false;
    const update = () => {
      const remaining = remainingSeconds(deadline);
      setSnapshot((current) => current.deadline === deadline && current.seconds === remaining
        ? current : { deadline, seconds: remaining });
      if (remaining === 0) {
        clearInterval(timer);
        if (!notified && AppState.currentState === 'active' && Date.now() - deadline <= 1000) {
          playHaptic('timer');
        }
        notified = true;
      }
    };
    const timer = setInterval(update, 250);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') update();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [deadline]);

  return snapshot.deadline === deadline ? snapshot.seconds : remainingSeconds(deadline);
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function RestClock({ seconds, disabled, extend, skip }: {
  seconds: number; disabled: boolean; extend: () => void; skip: () => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <Text style={sessionStyles.timerLabel}>{seconds > 0 ? `${t.planRest} · ${clock(seconds)}` : t.workoutRestDone}</Text>
      <View style={styles.row}>
        <SecondaryButton label={t.workoutExtendRest} disabled={disabled} onPress={extend} />
        {seconds > 0 && <Action label={t.workoutSkipRest} disabled={disabled} onPress={skip} />}
      </View>
    </>
  );
}

function HoldClock({ deadline }: { deadline: number }) {
  const { t } = useLanguage();
  const remaining = useCountdown(deadline);
  return <Text style={sessionStyles.link}>{remaining ? `${t.workoutHold} · ${clock(remaining)}` : t.workoutHoldDone}</Text>;
}

function SetForm({ session, movement, options, initial, existing, disabled, onSave, onCancel }: {
  session: WorkoutSession;
  movement: number;
  options: RecordedSet['exercise'][];
  initial?: RecordedSet;
  existing: boolean;
  disabled: boolean;
  onSave: (set: RecordedSet | null) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [exercise, setExercise] = useState(initial?.exercise ?? session.schedule.exercises[movement].name);
  const [weight, setWeight] = useState(initial?.weightKg == null ? '' : displaySetWeight(initial.weightKg, session.units));
  const [reps, setReps] = useState(initial ? String(initial.seconds ?? initial.reps) : '');
  const [rir, setRir] = useState(initial?.rir == null ? '' : String(initial.rir));
  const [notes, setNotes] = useState(existing ? initial?.notes ?? '' : '');
  const [invalid, setInvalid] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const timed = exerciseSeconds(exercise) !== null;

  function save() {
    const record = parseSet(exercise, weight, timed ? '1' : reps, rir, notes, session.units);
    const seconds = timed ? Number(reps.trim()) : undefined;
    if (!record || (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 1 || seconds > 999))) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    // Preserve exact stored precision when the displayed weight was left unchanged.
    if (initial?.exercise === exercise && initial.weightKg != null && weight === displaySetWeight(initial.weightKg, session.units)) {
      record.weightKg = initial.weightKg;
    }
    onSave({ ...record, seconds, effort: existing ? initial?.effort : undefined, kind: initial?.kind });
  }

  return (
    <View style={sessionStyles.form}>
      {initial?.kind === 'warmup' && <Text style={sessionStyles.link}>{t.workoutWarmupSet}</Text>}
      {options.length > 1 && (
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.workoutMovement}>
          {options.map((option) => (
            <Pressable key={option} accessibilityRole="radio"
              accessibilityState={{ checked: option === exercise }} disabled={disabled}
              onPress={() => {
                if (option === exercise) return;
                setExercise(option);
                setWeight('');
                setReps(String(exerciseSeconds(option) ?? session.minReps));
              }}
              style={[sessionStyles.secondary, option === exercise && sessionStyles.selected]}>
              <Text style={styles.body}>{t[option]}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <WorkoutInput label={`${t.workoutWeight} (${weightLabel(session.units)})`}
        value={weight} onChange={setWeight} mode="decimal" disabled={disabled} />
      <WorkoutInput label={t[timed ? 'workoutSecondsInput' : 'workoutReps']} value={reps} onChange={setReps}
        mode="numeric" disabled={disabled} />
      <WorkoutInput label={t.workoutRir} value={rir} onChange={setRir} mode="numeric" disabled={disabled} />
      <WorkoutInput label={t.workoutNotes} value={notes} onChange={setNotes} mode="text" disabled={disabled} />
      {invalid && <Text accessibilityRole="alert" style={styles.secondary}>{t.workoutBadSet}</Text>}
      {!disabled && (
        confirmRemove ? (
          <>
            <Text style={styles.secondary}>{t.workoutRemoveConfirm}</Text>
            <View style={styles.row}>
              <Action label={t.workoutRemoveSet} onPress={() => onSave(null)} />
              <Secondary label={t.profileCancel} onPress={() => setConfirmRemove(false)} />
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <Action label={t.workoutSaveSet} onPress={save} />
            <Secondary label={t.profileCancel} onPress={onCancel} />
            {existing && <Secondary label={t.workoutRemoveSet} onPress={() => setConfirmRemove(true)} />}
          </View>
        )
      )}
    </View>
  );
}

function WorkoutInput({ label, value, onChange, mode, disabled }: {
  label: string; value: string; onChange: (value: string) => void;
  mode: 'decimal' | 'numeric' | 'text'; disabled: boolean;
}) {
  return (
    <View style={sessionStyles.field}>
      <Text style={styles.body}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
        inputMode={mode} editable={!disabled} maxLength={mode === 'text' ? 300 : 10}
        style={sessionStyles.input} />
    </View>
  );
}

function Secondary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={sessionStyles.secondary}>
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
}

function SetLine({ set, index, units }: { set: RecordedSet; index: number; units: WorkoutSession['units'] }) {
  const { t } = useLanguage();
  return (
    <View style={sessionStyles.details}>
      <Text style={styles.body}>{index + 1}. {t[set.exercise]}{set.kind === 'warmup' ? ` · ${t.workoutWarmupSet}` : ''}</Text>
      <Text style={styles.secondary}>{setSummary(set, units, t)}
        {set.rir !== null ? ` · RIR ${set.rir}` : ''}{set.effort ? ` · ${t[set.effort]}` : ''}</Text>
      {set.notes ? <Text style={styles.secondary}>{set.notes}</Text> : null}
    </View>
  );
}

function setSummary(set: RecordedSet, units: WorkoutSession['units'], t: ReturnType<typeof useLanguage>['t']) {
  const weight = set.weightKg === null
    ? t[exerciseGuides[set.exercise].equipment === 'bodyweight' ? 'bodyweight' : 'workoutUnweighted']
    : `${displaySetWeight(set.weightKg, units)} ${weightLabel(units)}`;
  return `${weight} · ${set.seconds ?? set.reps} ${t[set.seconds ? 'planSeconds' : 'reps']}`;
}

type HistoryRecord = Pick<WorkoutSession, 'startedAt' | 'units' | 'sets' | 'checkedSets'> & {
  id: string | number;
  schedule: Pick<WorkoutSession['schedule'], 'day'>;
};

export function WorkoutHistory<T extends HistoryRecord>({ history, actions, records }: {
  history: T[];
  actions?: (record: T) => ReactNode;
  records?: ReadonlySet<number>;
}) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState<T['id']>();
  const [visible, setVisible] = useState(10);
  const time = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  return (
    <Card title={t.workoutHistory} icon="history">
      {history.length === 0 && <Text style={styles.secondary}>{t.workoutHistoryEmpty}</Text>}
      {history.slice(0, visible).map((session) => (
        <View key={session.id} style={sessionStyles.form}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === session.id }}
            onPress={() => setOpen(open === session.id ? undefined : session.id)} style={sessionStyles.row}>
            <View style={sessionStyles.details}>
              <Text style={styles.body}>{time.format(new Date(session.startedAt))}</Text>
              <Text style={styles.secondary}>{t[weekdays[session.schedule.day - 1]]} · {countSets(session)} {t.workoutSetsLogged}</Text>
              {countCheckOnly(session) > 0 && <Text style={styles.secondary}>{t.checkOnly} · {countCheckOnly(session)}</Text>}
              {countWarmupSets(session) > 0 && <Text style={styles.secondary}>
                {t.workoutWarmupCount} {countWarmupSets(session)}
              </Text>}
              {typeof session.id === 'number' && records?.has(session.id) &&
                <Text style={sessionStyles.link}>{t.workoutPersonalRecord}</Text>}
            </View>
            <Text style={sessionStyles.link}>{t[open === session.id ? 'workoutHideDetails' : 'workoutDetails']}</Text>
          </Pressable>
          {open === session.id && (
            <>
              {session.sets.flatMap((sets, movement) => sets.map((set, index) => (
                <SetLine key={`${movement}-${index}`} set={set} index={index} units={session.units} />
              )))}
              {actions?.(session)}
            </>
          )}
        </View>
      ))}
      {history.length > visible && <Secondary label={t.workoutMore} onPress={() => setVisible(visible + 10)} />}
    </Card>
  );
}

const sessionStyles = StyleSheet.create({
  amount: { color: colors.text, fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  workType: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  guide: { padding: 12, borderColor: colors.accentBorder, borderWidth: 1, borderRadius: 12,
    backgroundColor: colors.background, gap: 8 },
  rest: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  timerLabel: { color: colors.accent, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48,
    borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 },
  details: { flex: 1, gap: 2 },
  link: { color: colors.accent, fontWeight: '600' },
  form: { gap: 10, paddingTop: 8 },
  field: { gap: 5 },
  input: { color: colors.text, backgroundColor: colors.background, minHeight: 48,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9 },
  secondary: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  selected: { borderColor: colors.accent, backgroundColor: colors.activeSurface },
});

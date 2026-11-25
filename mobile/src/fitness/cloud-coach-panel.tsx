import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';

import { Pressable } from './pressable';

import { useAccount } from '@/auth/account-provider';
import { askCloudCoach, CoachRequestError, type CoachContext, type CoachErrorLabel, type CoachQuestion } from '@/auth/cloud-coach';
import { CloudRequestError } from '@/auth/cloud-client';

import { exerciseGuides } from './exercise-guide';
import { useLanguage } from './language';
import type { readTrainingCoach } from './training-coach';
import { Action, Card, colors, SecondaryButton, styles } from './ui';
import { activeExercise, displaySetWeight, weightLabel, type RecordedSet, type WorkoutSession } from './workout-log';

type CoachData = Awaited<ReturnType<typeof readTrainingCoach>>;
type Copy = ReturnType<typeof useLanguage>['t'];
type Bucket = keyof CoachContext;
const buckets = ['plan', 'load', 'week'] as const;
const questions = ['cloudCoachPromptPlan', 'cloudCoachPromptLoad', 'cloudCoachPromptWeek'] as const;
const bucketCopy = { plan: 'cloudCoachPlanData', load: 'cloudCoachLoadData', week: 'cloudCoachWeekData' } as const;
const questionLimit = 420;

function contextFor(data: CoachData | undefined, t: Copy): CoachContext {
  if (!data) return {};
  const context: CoachContext = {};
  if (data.accepted) {
    const { plan } = data.accepted;
    const active = data.training.state === 'active' ? data.training.session : undefined;
    const schedule = active?.schedule ?? data.schedule;
    context.plan = {
      focus: t[schedule?.focus ?? plan.focus ?? 'balanced'],
      equipment: t[plan.equipment], days: plan.days,
      exercises: (schedule?.exercises ?? []).map(({ name }, index) => t[active ? activeExercise(active, index) : name]),
    };
  }
  if (data.recommendation) {
    const { units, suggestion } = data.recommendation;
    const { value, matched } = suggestion;
    const start = exerciseGuides[value.exercise].equipment === 'gymMachines'
      ? t[suggestion.reason === 'workoutAfterBreak' || suggestion.reason === 'workoutFromLightMode'
        ? 'workoutMachineLighter' : 'workoutMachineStart'] : undefined;
    context.load = {
      exercise: t[value.exercise],
      suggestion: displaySet(value, units, t, start),
      reason: t[suggestion.reason],
      lastSet: matched ? displaySet(matched, units, t) : null,
    };
  }
  context.week = {
    start: data.week.start, through: data.week.through, workouts: data.trainingSummary.sessions,
    sets: data.trainingSummary.sets, foodDays: data.nutritionSummary?.loggedDays ?? null,
  };
  return context;
}

function displaySet(set: RecordedSet, units: WorkoutSession['units'], t: Copy, start?: string) {
  const equipment = exerciseGuides[set.exercise].equipment;
  const weight = set.weightKg === null
    ? start ?? t[equipment === 'bodyweight' ? 'bodyweight' : 'workoutUnweighted']
    : displaySetWeight(set.weightKg, units) + ' ' + weightLabel(units);
  return weight + ' × ' + (set.seconds ?? set.reps) + ' ' + t[set.seconds ? 'planSeconds' : 'reps'];
}

function contextText(context: CoachContext, key: Bucket, t: Copy) {
  if (key === 'plan' && context.plan) {
    const { focus, days, equipment, exercises } = context.plan;
    return [focus, equipment, days + ' ' + t.daysPerWeek, ...exercises].join(' · ');
  }
  if (key === 'load' && context.load) {
    const { exercise, suggestion, reason, lastSet } = context.load;
    return [exercise, suggestion, reason, lastSet && t.workoutLastWorkingSet + ' ' + lastSet].filter(Boolean).join(' · ');
  }
  if (key === 'week' && context.week) {
    const { start, through, workouts, sets, foodDays } = context.week;
    return start + ' – ' + through + ' · ' + t.weeklyWorkouts + ' ' + workouts + ' · ' + t.weeklyWorkingSets + ' ' + sets
      + (foodDays === null ? '' : ' · ' + t.weeklyFoodDays + ' ' + foodDays);
  }
  return '';
}

export function CloudCoachPanel({ data }: { data?: CoachData }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { state } = useAccount();
  const [opened, setOpened] = useState(false);
  return (
    <Card title={t.cloudCoachTitle} icon="cloud">
      {!opened ? <SecondaryButton label={t.cloudCoachOpen} icon="arrow" onPress={() => setOpened(true)} />
        : <>
          {state.status === 'signedIn'
            ? <CloudQuestionForm key={state.userId} userId={state.userId} data={data} />
            : <Text style={styles.secondary}>{t[state.status === 'disabled' ? 'cloudCoachSetup'
              : state.status === 'loading' ? 'accountLoading' : 'cloudCoachSignIn']}</Text>}
          {state.status === 'signedOut' && <SecondaryButton label={t.profile}
            onPress={() => router.navigate('/profile')} />}
          <SecondaryButton label={t.cloudCoachClose} onPress={() => setOpened(false)} />
        </>}
    </Card>
  );
}

function CloudQuestionForm({ userId, data }: { userId: string; data?: CoachData }) {
  const { language, t } = useLanguage();
  const [question, setQuestion] = useState('');
  const [selected, setSelected] = useState<Bucket[]>([]);
  const [preview, setPreview] = useState<CoachQuestion>();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CoachErrorLabel>();
  const request = useRef<AbortController | null>(null);
  const context = contextFor(data, t);

  useEffect(() => () => { request.current?.abort(); }, []);

  function prepare() {
    if (!question.trim()) return;
    const authorized: CoachContext = {};
    if (selected.includes('plan') && context.plan) authorized.plan = context.plan;
    if (selected.includes('load') && context.load) authorized.load = context.load;
    if (selected.includes('week') && context.week) authorized.week = context.week;
    setError(undefined);
    setReply('');
    setPreview({ language, question: question.trim(), context: authorized });
    Keyboard.dismiss();
  }

  async function send() {
    if (!preview || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const answer = await askCloudCoach(userId, preview, controller.signal);
      if (!controller.signal.aborted) setReply(answer);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const label = failure instanceof CoachRequestError ? failure.label
        : failure instanceof CloudRequestError && failure.label === 'cloudAccountChanged' ? 'cloudCoachSignIn'
          : 'cloudCoachUnavailable';
      setError(label);
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const included = preview ? buckets.filter((key) => preview.context[key]) : [];
  return (
    <>
      {!preview ? <>
        <Text style={styles.secondary}>{t.cloudCoachIntro}</Text>
        <View style={styles.row}>
          {questions.map((key) => <SecondaryButton key={key} label={t[key]} onPress={() => setQuestion(t[key])} />)}
        </View>
        <TextInput accessibilityLabel={t.cloudCoachQuestion} placeholder={t.cloudCoachQuestion}
          placeholderTextColor={colors.muted} multiline value={question} onChangeText={setQuestion}
          maxLength={questionLimit} style={[styles.input, cloudStyles.input]} />
        <Text style={styles.body}>{t.cloudCoachChooseData}</Text>
        <View style={styles.row}>
          {buckets.map((key) => {
            const available = Boolean(context[key]);
            const checked = available && selected.includes(key);
            return (
              <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: !available }}
                disabled={!available} style={[styles.choice, checked && styles.selectedChoice, !available && styles.disabled]}
                onPress={() => setSelected((items) =>
                  items.includes(key) ? items.filter((item) => item !== key) : [...items, key])}>
                <Text style={[styles.body, checked && styles.selectedChoiceLabel]}>{t[bucketCopy[key]]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Action label={t.cloudCoachPreview} disabled={!question.trim()} onPress={prepare} />
      </> : <>
        <View style={cloudStyles.preview}>
          <Text style={styles.cardTitle}>{t.cloudCoachPreview}</Text>
          <Text selectable style={styles.body}>{preview.question}</Text>
          {included.length ? included.map((key) => (
            <Text key={key} style={styles.secondary}>{t[bucketCopy[key]]} · {contextText(preview.context, key, t)}</Text>
          )) : <Text style={styles.secondary}>{t.cloudCoachQuestionOnly}</Text>}
        </View>
        {reply ? <>
          <Text style={styles.cardTitle}>{t.cloudCoachAnswer}</Text>
          <Text selectable style={styles.body}>{reply}</Text>
          <SecondaryButton label={t.cloudCoachNew} onPress={() => {
            setPreview(undefined);
            setSelected([]);
            setQuestion('');
            setReply('');
          }} />
        </> : <>
          <Text style={styles.secondary}>{t.cloudCoachConsent}</Text>
          {error && <Text accessibilityRole="alert" style={styles.secondary}>{t[error]}</Text>}
          {busy && <Text accessibilityRole="alert" style={styles.secondary}>{t.cloudCoachWorking}</Text>}
          <View style={styles.row}>
            <Action label={t.cloudCoachSend} disabled={busy} onPress={() => { void send(); }} />
            <SecondaryButton label={t.cloudCoachEdit} disabled={busy} onPress={() => setPreview(undefined)} />
          </View>
        </>}
      </>}
    </>
  );
}

const cloudStyles = StyleSheet.create({
  input: { minHeight: 84, textAlignVertical: 'top' },
  preview: { backgroundColor: colors.background, padding: 12, borderRadius: 14, gap: 8 },
});

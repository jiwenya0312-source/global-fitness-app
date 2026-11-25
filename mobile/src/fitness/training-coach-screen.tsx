import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View } from 'react-native';

import { dayDate } from './calendar';
import { CloudCoachPanel } from './cloud-coach-panel';
import { exerciseGuides } from './exercise-guide';
import { useLanguage } from './language';
import { recoveryResultCopy } from './recovery';
import { readTrainingCoach } from './training-coach';
import { Action, Card, Choice, colors, Page, SecondaryButton, Stat, styles } from './ui';
import { activeExercise, countSets, displaySetWeight, weightLabel } from './workout-log';

const topics = ['coachToday', 'coachLoad', 'coachRecovery', 'coachWeek'] as const;
type CoachData = Awaited<ReturnType<typeof readTrainingCoach>>;
type Topic = typeof topics[number];
type State = { status: 'loading' | 'failed' } | { status: 'ready'; data: CoachData };

export function TrainingCoachScreen({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [topic, setTopic] = useState<Topic>('coachToday');
  const [state, setState] = useState<State>({ status: 'loading' });
  const request = useRef(0);
  const load = useCallback(() => {
    const id = ++request.current;
    setState({ status: 'loading' });
    void readTrainingCoach(new Date()).then((data) => {
      if (id === request.current) setState({ status: 'ready', data });
    }, () => {
      if (id === request.current) setState({ status: 'failed' });
    });
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const resume = AppState.addEventListener('change', (status) => { if (status === 'active') load(); });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => {
      request.current += 1;
      resume.remove();
      back.remove();
    };
  }, [load, onClose]));

  const openWorkout = () => router.navigate('/explore');
  const editProfile = () => router.navigate({ pathname: '/profile', params: { setup: '1' } });

  let content;
  if (state.status === 'loading') content = <Text style={styles.secondary}>{t.coachLoading}</Text>;
  else if (state.status === 'failed') content = <Card title={t.coach}>
    <Text style={styles.secondary} accessibilityRole="alert">{t.coachReadError}</Text>
    <Action label={t.retry} onPress={load} />
  </Card>;
  else if (state.status === 'ready') {
    const { data } = state;
    switch (topic) {
      case 'coachToday':
        content = <PlanAnswer data={data} openWorkout={openWorkout} editProfile={editProfile} />;
        break;
      case 'coachLoad':
        content = <LoadAnswer data={data} openWorkout={openWorkout} />;
        break;
      case 'coachRecovery':
        content = <RecoveryAnswer data={data} openWorkout={openWorkout} />;
        break;
      case 'coachWeek':
        content = <WeekAnswer data={data}
          openReport={() => router.navigate({ pathname: '/progress', params: { weekly: '1' } })} />;
        break;
    }
  }

  return (
    <Page title={t.coach} icon="coach">
      <SecondaryButton label={t.coachHome} icon="previous" onPress={onClose} />
      <Text style={styles.secondary}>{t.coachDevice}</Text>
      <View style={coachStyles.topics} accessibilityRole="radiogroup" accessibilityLabel={t.coach}>
        {topics.map((item) => <Choice key={item} label={t[item]} selected={topic === item}
          disabled={false} onPress={() => setTopic(item)} />)}
      </View>
      {content}
      <CloudCoachPanel data={state.status === 'ready' ? state.data : undefined} />
    </Page>
  );
}

function PlanAnswer({ data, openWorkout, editProfile }: {
  data: CoachData; openWorkout: () => void; editProfile: () => void;
}) {
  const { language, t } = useLanguage();
  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { weekday: 'long', month: 'short', day: 'numeric' });
  const state = data.training;
  if (state.state === 'setup' || state.state === 'blocked') {
    return <Card title={t.coachToday} icon="workout" tone="accent">
      <Text style={styles.secondary}>{state.state === 'blocked' ? t[state.reason] : t.setupHomeHint}</Text>
      <Action label={t[state.state === 'setup' ? 'setupContinue' : 'planOpenProfile']} onPress={editProfile} />
    </Card>;
  }
  if (state.state === 'confirmPlan') return (
    <Card title={t.coachToday} icon="workout" tone="accent">
      <Text style={styles.secondary}>{t.coachConfirmPlan}</Text>
      <Action label={t.openWorkout} onPress={openWorkout} />
    </Card>
  );

  const session = 'session' in state && 'startedAt' in state.session ? state.session : undefined;
  const schedule = session?.schedule ?? data.schedule;
  const hero = state.state === 'rest' ? t.homeRestDay : state.state === 'completed' ? t.homeWorkoutComplete
    : state.state === 'active' ? t.workoutInProgress : t[schedule?.focus ?? 'balanced'];

  return (
    <>
      <Card title={t.coachToday} icon="workout" tone="accent">
        <Text style={styles.headline}>{hero}</Text>
        {state.state === 'rest' && <Text style={styles.body}>
          {t.homeNextWorkout} · {date.format(dayDate(data.nextDay))}
        </Text>}
        {session && <Text style={styles.secondary}>{countSets(session)} {t.weeklyWorkingSets}</Text>}
        {schedule && state.state !== 'completed' && <>
          <View style={styles.row}>
            {state.state !== 'scheduled' && <Stat label={t[state.state === 'rest' ? 'coachNextFocus' : 'focusLabel']}
              value={t[schedule.focus ?? 'balanced']} />}
            <Stat label={t.coachDuration} value={schedule.minutes + ' ' + t.planMinutes} />
          </View>
          <Text style={styles.secondary}>{schedule.exercises.map(({ name }, index) =>
            t[state.state === 'active' && session ? activeExercise(session, index) : name]).join(' · ')}</Text>
        </>}
        {data.recoveryRestriction && data.currentReview && (
          <Text style={styles.body}>{t[recoveryResultCopy[data.currentReview.decision][0]]}</Text>
        )}
        <Action label={t[state.state === 'active' ? 'homeResumeWorkout' : 'openWorkout']} onPress={openWorkout} />
      </Card>
      {data.accepted && <Card title={t.coachPlanBasis} icon="calendar">
        <Text style={styles.body}>{t[data.accepted.plan.goal]} · {t[data.accepted.plan.experience]}</Text>
        <Text style={styles.secondary}>{t[data.accepted.plan.equipment]} · {data.accepted.plan.days} {t.daysPerWeek}
          {' · '}{t[data.accepted.plan.focus ?? 'balanced']}</Text>
        <Text style={styles.secondary}>{t.coachPlanBasisNote}</Text>
      </Card>}
    </>
  );
}

function LoadAnswer({ data, openWorkout }: { data: CoachData; openWorkout: () => void }) {
  const { t } = useLanguage();
  const recommendation = data.recommendation;
  const reason = data.block ? t[data.block] : data.recoveryRestriction ? t.coachReviewFirst
    : !data.hasProfile || data.training.state === 'confirmPlan' ? t.coachConfirmPlan : t.coachNoSet;
  if (!recommendation) return <Card title={t.coachLoad} icon="workout">
    <Text style={styles.secondary}>{reason}</Text>
    <Action label={t.openWorkout} onPress={openWorkout} />
  </Card>;
  const { units, suggestion } = recommendation;
  const { value, matched } = suggestion;
  const equipment = exerciseGuides[value.exercise].equipment;
  const amount = (weight: number | null) => weight !== null
    ? displaySetWeight(weight, units) + ' ' + weightLabel(units)
    : equipment === 'bodyweight' ? t.bodyweight : t.workoutUnweighted;
  const suggested = value.weightKg === null && equipment === 'gymMachines'
    ? t[suggestion.reason === 'workoutAfterBreak' || suggestion.reason === 'workoutFromLightMode'
      ? 'workoutMachineLighter' : 'workoutMachineStart'] : amount(value.weightKg);
  return (
    <Card title={t.coachLoad} icon="workout" tone="accent">
      <Text style={styles.secondary}>{t[value.exercise]} · {t[equipment]}</Text>
      <Text style={styles.headline}>{suggested} × {value.seconds ?? value.reps} {t[value.seconds ? 'planSeconds' : 'reps']}</Text>
      <Text style={styles.body}>{t[suggestion.reason]}</Text>
      {matched && <Text style={styles.secondary}>{t.workoutLastWorkingSet} · {amount(matched.weightKg)}
        {' × '}{matched.seconds ?? matched.reps} {t[matched.seconds ? 'planSeconds' : 'reps']}</Text>}
      <Text style={styles.secondary}>{t.coachLoadNote}</Text>
      <Action label={t.openWorkout} onPress={openWorkout} />
    </Card>
  );
}

function RecoveryAnswer({ data, openWorkout }: { data: CoachData; openWorkout: () => void }) {
  const { t } = useLanguage();
  const review = data.currentReview;
  return (
    <Card title={t.coachRecovery} icon="recovery" tone="accent">
      {review ? <>
        <Text style={styles.headline}>{t[recoveryResultCopy[review.decision][0]]}</Text>
        <Text style={styles.secondary}>{t[review.reason]}</Text>
        <View style={styles.row}>
          <Stat label={t.weeklySleep} value={t[`recovery_${review.feedback.sleep}`]} />
          <Stat label={t.weeklyFatigue} value={t[`recovery_${review.feedback.fatigue}`]} />
          <Stat label={t.weeklySoreness} value={t[`recovery_${review.feedback.soreness}`]} />
        </View>
      </> : <Text style={styles.secondary}>{data.block ? t[data.block]
        : t[data.feedbackAvailable ? 'coachNoRecovery' : 'recoveryLoadFailed']}</Text>}
      <Action label={t.openWorkout} onPress={openWorkout} />
    </Card>
  );
}

function WeekAnswer({ data, openReport }: { data: CoachData; openReport: () => void }) {
  const { language, t } = useLanguage();
  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' });
  const { trainingSummary, nutritionSummary, week } = data;
  return (
    <Card title={t.coachWeek} icon="progress" tone="accent">
      <Text style={styles.secondary}>{date.format(dayDate(week.start))} – {date.format(dayDate(week.through))}</Text>
      <View style={styles.row}>
        <Stat label={t.weeklyWorkouts} value={String(trainingSummary.sessions)} />
        <Stat label={t.weeklyWorkingSets} value={String(trainingSummary.sets)} />
        <Stat label={t.weeklyFoodDays} value={nutritionSummary
          ? String(nutritionSummary.loggedDays) + ' / ' + week.observedDays.length : '—'} />
      </View>
      {!trainingSummary.sessions && <Text style={styles.secondary}>{t.weeklyNoPerformance}</Text>}
      {!nutritionSummary && <Text style={styles.secondary}>{t.coachFoodReadError}</Text>}
      <Action label={t.weeklyOpen} onPress={openReport} />
    </Card>
  );
}

const coachStyles = StyleSheet.create({
  topics: { ...styles.row, padding: 10, backgroundColor: colors.surface, borderRadius: 16,
    borderColor: colors.border, borderWidth: 1 },
});

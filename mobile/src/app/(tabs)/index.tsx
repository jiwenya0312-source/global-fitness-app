import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/fitness/pressable';

import { measurementText, measurementUnit } from '@/fitness/body-measurements';
import { dayDate, localDay } from '@/fitness/calendar';
import { readHomeDay, type HomeDay } from '@/fitness/home-dashboard';
import { Icon, type IconName } from '@/fitness/icons';
import { useLanguage } from '@/fitness/language';
import { dailyTotals } from '@/fitness/nutrition';
import { RunShortcut } from '@/fitness/running-ui';
import { TrainingCoachScreen } from '@/fitness/training-coach-screen';
import { Action, Card, colors, Page, SecondaryButton, styles, Track } from '@/fitness/ui';
import { countCheckOnly, countSets, plannedWorkoutProgress, weekdays } from '@/fitness/workout-log';
import { WorkoutTargets } from '@/fitness/workout-check-in';

const trainingCover = require('@/assets/images/training-cover.jpg');

type Copy = ReturnType<typeof useLanguage>['t'];

function trainingCard(training: HomeDay['training'] | undefined, t: Copy, date: Intl.DateTimeFormat) {
  if (!training) return { title: t.homeLoading, detail: t.homeLoadingTraining };
  if (training.state === 'failed') {
    return { title: t.homeReadFailed, detail: t.homeLoadingTraining, action: 'reload', label: t.retry } as const;
  }

  const today = training.value;
  switch (today.state) {
    case 'active':
      return { title: t.workoutInProgress,
        detail: `${countSets(today.session)} ${t.workoutSetsLogged}${countCheckOnly(today.session) ? ` · ${t.checkOnly} ${countCheckOnly(today.session)}` : ''}`,
        action: 'workout', label: t.homeResumeWorkout } as const;
    case 'completed': {
      const progress = plannedWorkoutProgress(today.session);
      return { title: t[progress.done < progress.total ? 'homeWorkoutPartial' : 'homeWorkoutComplete'],
        detail: `${progress.done} / ${progress.total} ${t.sets}`,
        action: 'workout', label: t.openWorkout } as const;
    }
    case 'setup':
      return { title: t.homeSetup, detail: t.setupHomeHint, action: 'setup', label: t.setupContinue } as const;
    case 'blocked':
      return { title: t.homePlanReview, detail: t[today.reason], action: 'profile', label: t.planOpenProfile } as const;
    case 'confirmPlan':
      return { title: t.homePreparePlan, detail: t.planIntro, action: 'plan', label: t.planPreview } as const;
    case 'scheduled':
      return {
        title: today.makeup ? t.homeMakeupWorkout : `${t[weekdays[today.session.day - 1]]}${t.homeWorkoutHeadingSuffix}`,
        detail: `${t[today.session.focus ?? 'balanced']} · ${today.session.exercises.length} ${t.homeExercises} · ${t.planAbout} ${today.session.minutes} ${t.planMinutes}`,
        action: 'start', label: t.homeStartWorkout,
      } as const;
    case 'rest':
      return { title: t.homeRestDay, detail: `${t.homeNextWorkout} · ${date.format(dayDate(today.nextDay))}`,
        action: 'workout', label: t.openWorkout } as const;
  }
}

export default function Home() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [showCoach, setShowCoach] = useState(false);
  const closeCoach = useCallback(() => setShowCoach(false), []);
  const [day, setDay] = useState(localDay);
  const [overview, setOverview] = useState<HomeDay>();
  const [startNotice, setStartNotice] = useState<'homeStartChanged' | 'workoutStartError'>();
  const request = useRef(0);
  const focused = useRef(false);

  const refresh = useCallback((next = localDay()) => {
    const id = ++request.current;
    setDay(next);
    void readHomeDay(next).then((value) => {
      if (request.current === id) setOverview(value);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function refreshAndSchedule() {
      clearTimeout(timer);
      const now = new Date();
      refresh(localDay(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 20);
      timer = setTimeout(refreshAndSchedule, midnight.getTime() - now.getTime());
    }

    refreshAndSchedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAndSchedule();
    });
    return () => {
      focused.current = false;
      request.current += 1;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [refresh]));

  const locale = language === 'zh' ? 'zh-CN' : 'en';
  const fullDate = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const current = overview?.day === day ? overview : undefined;
  const hero = trainingCard(current?.training, t, fullDate);
  const training = current?.training?.state === 'ready' ? current.training.value : undefined;

  function openTraining() {
    setStartNotice(undefined);
    switch (hero.action) {
      case 'setup': router.navigate({ pathname: '/profile', params: { setup: '1' } }); break;
      case 'profile': router.navigate('/profile'); break;
      case 'workout': router.navigate('/explore'); break;
      case 'plan': router.navigate({ pathname: '/explore', params: { preview: '1' } }); break;
      case 'start':
        if (day === localDay()) router.navigate({ pathname: '/explore', params: { todayWorkout: day } });
        else {
          setStartNotice('homeStartChanged');
          refresh();
        }
        break;
      case 'reload': refresh(); break;
    }
  }

  const nutrition = current?.nutrition?.state === 'ready' ? current.nutrition.value : undefined;
  const calories = nutrition?.entries.length ? dailyTotals(nutrition.entries).kcal : null;
  const kcalTarget = nutrition?.goals?.values.kcal;
  const nutritionNote = !current ? t.homeLoading : !nutrition ? t.homeReadFailed
    : calories === null ? t.homeNoFood : !kcalTarget ? t.homeNoCalorieGoal : undefined;
  const body = current?.body?.state === 'ready' ? current.body.value : undefined;
  const bodyMetric = body?.weight ? 'weight' : 'waist';
  const recent = body?.[bodyMetric];
  const bodyValue = body && recent ? number.format(Number(measurementText(recent.value, bodyMetric, body.units))) : undefined;
  const bodyUnit = body && recent ? measurementUnit(bodyMetric, body.units) : undefined;
  const waistNote = body?.weight && body.waist
    ? `${t.waist} · ${number.format(Number(measurementText(body.waist.value, 'waist', body.units)))} ${measurementUnit('waist', body.units)}`
    : undefined;
  const bodyNote = !current ? t.homeLoading : !body ? t.homeReadFailed
    : recent ? shortDate.format(dayDate(recent.day)) : t.homeNoMeasurements;
  const waistDate = waistNote && body?.waist?.day && body.waist.day !== recent?.day
    ? shortDate.format(dayDate(body.waist.day)) : undefined;
  const failed = current && [current.training, current.nutrition, current.body]
    .some((section) => section.state === 'failed');

  if (showCoach) return <TrainingCoachScreen onClose={closeCoach} />;

  return (
    <Page title={t.today} detail={fullDate.format(dayDate(day))}>
      <View style={homeStyles.hero}>
        <Image source={trainingCover} style={StyleSheet.absoluteFill}
          contentFit="cover" contentPosition="top center" accessible={false} />
        <View style={homeStyles.heroShade} pointerEvents="none" />
        <View style={homeStyles.heroCopy}>
          <View style={homeStyles.heroLabel}>
            <Icon name="workout" color={colors.accent} size={17} />
            <Text style={homeStyles.heroLabelText}>{t.workout}</Text>
          </View>
          <Text accessibilityRole="header" style={homeStyles.heroTitle}>{hero.title}</Text>
          <Text style={homeStyles.heroMeta}>{hero.detail}</Text>
          {hero.label && <Action icon="arrow" label={hero.label} onPress={openTraining} />}
          {startNotice && <Text accessibilityRole="alert" style={homeStyles.heroMeta}>{t[startNotice]}</Text>}
        </View>
      </View>
      {training?.state === 'scheduled' && <Card title={language === 'zh' ? '今天练什么' : 'Today’s workout'} icon="workout">
        <Text style={styles.secondary}>{language === 'zh' ? '本周训练' : 'This week'} · {training.done} / {training.total}</Text>
        <WorkoutTargets session={training.preview} history={training.history} profile={training.profile} limit={3} />
        {training.session.exercises.length > 3 && <Text style={styles.secondary}>
          +{training.session.exercises.length - 3} {language === 'zh' ? '个动作' : 'more exercises'}
        </Text>}
      </Card>}
      <RunShortcut today={day} />
      <View style={homeStyles.coach}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.coach}
          onPress={() => setShowCoach(true)}
          style={homeStyles.coachAction}>
          <View style={homeStyles.coachIcon}><Icon name="coach" color={colors.accent} size={21} /></View>
          <View style={homeStyles.coachCopy}>
            <Text style={styles.cardTitle}>{t.coach}</Text>
            <Text style={styles.secondary}>{t.coachEntry}</Text>
          </View>
          <Icon name="next" color={colors.muted} size={20} />
        </Pressable>
      </View>
      <SecondaryButton label={t.foodQuickHome} icon="plus"
        onPress={() => router.navigate({ pathname: '/nutrition', params: { quick: '1' } })} />
      <SecondaryButton label={t.homeLogBody} icon="scale"
        onPress={() => router.navigate({ pathname: '/progress', params: { record: '1', weekly: '0' } })} />
      <View style={homeStyles.metrics}>
        <MetricLink title={t.energy} icon="energy" tint={colors.warm}
          value={calories === null ? undefined : number.format(calories)} unit="kcal"
          summary={nutritionNote} onPress={() => router.navigate('/nutrition')}>
          {calories !== null && kcalTarget !== undefined && (
            <Track value={calories} target={kcalTarget} color={colors.warm} />
          )}
          {kcalTarget !== undefined && <Text style={homeStyles.metricNote}>{t.goal} {number.format(kcalTarget)} kcal</Text>}
        </MetricLink>
        <MetricLink title={recent ? t[bodyMetric] : t.body} icon="scale" tint={colors.cool}
          value={bodyValue} unit={bodyUnit} summary={bodyNote}
          actionLabel={t.homeViewTrends} onPress={() => router.navigate('/progress')}>
          {waistNote && (
            <Text style={homeStyles.metricNote}>{waistNote}{waistDate ? ` · ${waistDate}` : ''}</Text>
          )}
        </MetricLink>
      </View>
      {failed && current.training.state !== 'failed' && (
        <SecondaryButton label={t.homeRefresh} onPress={() => refresh()} />
      )}
    </Page>
  );
}

function MetricLink({ title, icon, tint, value, unit, summary, actionLabel, onPress, children }: {
  title: string; icon: IconName; tint: string; value?: string; unit?: string;
  summary?: string; actionLabel?: string; onPress: () => void; children: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={[actionLabel ?? title, value && `${value} ${unit ?? ''}`, summary].filter(Boolean).join(' · ')}
      onPress={onPress} style={homeStyles.metric}>
      <View style={homeStyles.metricHeading}>
        <View style={[homeStyles.metricIcon, { backgroundColor: `${tint}22` }]}>
          <Icon name={icon} color={tint} size={18} />
        </View>
        <Icon name="next" color={colors.muted} size={18} />
      </View>
      <Text style={homeStyles.metricLabel}>{title}</Text>
      {value && <Text style={homeStyles.metricValue}>{value} <Text style={homeStyles.metricUnit}>{unit}</Text></Text>}
      {summary && <Text style={homeStyles.metricNote}>{summary}</Text>}
      {children}
      {actionLabel && <Text style={homeStyles.metricNote}>{actionLabel}</Text>}
    </Pressable>
  );
}

const homeStyles = StyleSheet.create({
  hero: { position: 'relative', overflow: 'hidden', borderRadius: 25, minHeight: 300,
    backgroundColor: '#112016', borderWidth: 1, borderColor: colors.accentBorder, justifyContent: 'flex-end' },
  heroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#02080420' },
  heroCopy: { width: '68%', alignItems: 'flex-start', gap: 10, paddingHorizontal: 18, paddingVertical: 22 },
  heroLabel: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  heroLabelText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  heroTitle: { color: colors.text, fontSize: 39, lineHeight: 44, letterSpacing: -1.2, fontWeight: '900' },
  heroMeta: { color: '#E0E8D8', fontSize: 13, lineHeight: 19, fontWeight: '500' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexBasis: 132, flexGrow: 1, borderRadius: 20, borderWidth: 1, padding: 13,
    borderColor: colors.border, backgroundColor: colors.surface, gap: 6 },
  metricHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  metricValue: { color: colors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  metricUnit: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  metricNote: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  coach: { borderWidth: 1, borderColor: colors.accentBorder, borderRadius: 20, backgroundColor: colors.accentSurface },
  coachAction: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 62, padding: 12 },
  coachIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.activeSurface,
    justifyContent: 'center', alignItems: 'center' },
  coachCopy: { flex: 1, gap: 2 },
});

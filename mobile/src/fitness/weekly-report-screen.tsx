import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { measurementText, measurementUnit, type MeasurementUnits } from './body-measurements';
import { readBodyRecords } from './body-store';
import { ProgressPlot } from './body-trend';
import { dayDate, dayNumber, localDay, shiftDay } from './calendar';
import { useLanguage } from './language';
import { readNutritionEntriesBetween } from './nutrition-store';
import { readPlan, readProfile } from './profile-store';
import { readRecoveryHistory } from './recovery-store';
import { useRunning } from './running-provider';
import { RunWeekSummary } from './running-ui';
import { Action, Card, Choice, colors, Page, SecondaryButton, Stat, styles, Track } from './ui';
import {
  latestWeeklyReview, reportWeek, summarizeFourWeeks, summarizeMeasurements, summarizeNutrition, summarizeTraining, weeklyReportVersion,
  type PerformanceSeries, type ReportWeek,
} from './weekly-report';
import { displaySetWeight, weightLabel } from './workout-log';
import type { Exercise } from './workout-plan';
import { readWorkoutLog } from './workout-store';

type Report = {
  week: ReportWeek;
  generatedAt: Date;
  units: MeasurementUnits;
  training: ReturnType<typeof summarizeTraining> | null;
  month: ReturnType<typeof summarizeFourWeeks> | null;
  monthWeight: ReturnType<typeof summarizeMeasurements>[number] | undefined;
  nutrition: ReturnType<typeof summarizeNutrition> | null;
  body: ReturnType<typeof summarizeMeasurements> | null;
  recovery: { latest: ReturnType<typeof latestWeeklyReview> } | null;
};

export function WeeklyReportScreen({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { state: running } = useRunning();
  const [offset, setOffset] = useState(0);
  const [today, setToday] = useState(localDay);
  const [report, setReport] = useState<Report>();
  const request = useRef(0);
  const week = reportWeek(today, offset);
  const current = report?.week.start === week.start && report.week.through === week.through ? report : undefined;
  const locale = language === 'zh' ? 'zh-CN' : 'en';
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const year = week.start.slice(0, 4);
  const title = `${year} · ${date.format(dayDate(week.start))} – ${date.format(dayDate(week.end))}`;

  const load = useCallback(() => {
    const now = localDay();
    const range = reportWeek(now, offset);
    const id = ++request.current;
    setToday(now);
    setReport(undefined);
    void Promise.all([
      readProfile().catch(() => null),
      readPlan().catch(() => null),
      readWorkoutLog().catch(() => null),
      readNutritionEntriesBetween(range.start, range.through).catch(() => null),
      readBodyRecords().catch(() => null),
      readRecoveryHistory().catch(() => null),
    ]).then(([profile, plan, workouts, nutrition, body, recovery]) => {
      if (id !== request.current) return;
      const accepted = plan && profile && plan.profileSavedAt === profile.savedAt ? plan : null;
      setReport({
        week: range, generatedAt: new Date(), units: profile?.profile.units ?? 'metric',
        training: workouts ? summarizeTraining(workouts.history, range, accepted) : null,
        monthWeight: body ? summarizeMeasurements(body, { ...range, start: shiftDay(range.through, -27) })
          .find((item) => item.metric === 'weight') : undefined,
        month: workouts ? summarizeFourWeeks(workouts.history, range.through, accepted) : null,
        nutrition: nutrition ? summarizeNutrition(nutrition, range) : null,
        body: body ? summarizeMeasurements(body, range) : null,
        recovery: recovery ? { latest: latestWeeklyReview(recovery, range) } : null,
      });
    });
  }, [offset]);

  useFocusEffect(useCallback(() => {
    load();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') load();
    });
    return () => {
      request.current += 1;
      subscription.remove();
    };
  }, [load]));

  useFocusEffect(useCallback(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => back.remove();
  }, [onClose]));

  const failed = current && (!current.training || !current.nutrition || !current.body || !current.recovery);
  return (
    <Page title={t.weeklyTitle} icon="calendar">
      <SecondaryButton label={t.weeklyBack} icon="previous" onPress={onClose} />
      <Card title={title} icon="calendar">
        <Text style={styles.secondary}>{offset === 0
          ? `${t.weeklyThrough} ${date.format(dayDate(week.through))} · ${t.weeklyDevice}` : t.weeklyDevice}</Text>
        <View style={styles.row}>
          <SecondaryButton label={t.weeklyPrevious} icon="previous" disabled={year <= '0001'} onPress={() => setOffset(offset + 1)} />
          {offset > 0 && <SecondaryButton label={t.weeklyCurrent} onPress={() => setOffset(0)} />}
          <SecondaryButton label={t.weeklyNext} icon="next" disabled={offset === 0} onPress={() => setOffset(offset - 1)} />
        </View>
      </Card>
      {!current && <Text accessibilityRole="alert" style={styles.secondary}>{t.weeklyLoading}</Text>}
      {current && <>
        <Card title={t.weeklyTraining} icon="workout" tone="accent">
          {current.training ? <TrainingSummary key={week.start} week={week} report={current.training} />
            : <Text style={styles.secondary}>{t.weeklyReadFailed}</Text>}
          {!!current.training?.checked && <Text style={styles.secondary}>{t.checkOnly} · {current.training.checked}</Text>}
        </Card>
        {running.status === 'ready' && <RunWeekSummary data={running.data} start={week.start} end={week.through} />}
        {current.training && <PerformanceCard key={week.start} week={week}
          series={current.training.series} units={current.units} />}
        {current.month && <Card title={language === 'zh' ? '近四周训练变化' : 'Last four weeks'} icon="workout">
          <Text style={styles.body}>{language === 'zh' ? '已记录训练' : 'Logged workouts'} · {current.month.sessions}</Text>
          {current.month.due > 0 && <Text style={styles.body}>
            {language === 'zh' ? '计划完成' : 'Plan completion'} · {current.month.done} / {current.month.due}
          </Text>}
          {current.monthWeight?.difference != null && <Text style={styles.body}>
            {t.weight} · {current.monthWeight.difference > 0 ? '+' : ''}
            {measurementText(current.monthWeight.difference, 'weight', current.units)} {measurementUnit('weight', current.units)}
          </Text>}
          {current.month.series.length === 0 && <Text style={styles.secondary}>{language === 'zh'
            ? '同一动作至少需要两天的可比记录。' : 'Log comparable results on two days to see a change.'}</Text>}
          {current.month.series.map(({ exercise, metric, points }) => {
            const format = (value: number) => metric === 'load'
              ? displaySetWeight(value, current.units) + ' ' + weightLabel(current.units)
              : value + ' ' + t[metric === 'seconds' ? 'planSeconds' : 'reps'];
            return <Text key={exercise} style={styles.body}>{t[exercise]} · {format(points[0].value)} → {format(points.at(-1)!.value)}</Text>;
          })}
          {current.month.volume.map(([muscle, sets]) => {
            const labels: Record<string, string> = language === 'zh'
              ? { legs: '腿部', posterior: '后侧链', chest: '胸部', back: '背部', core: '核心', shoulders: '肩部' }
              : { legs: 'Legs', posterior: 'Posterior chain', chest: 'Chest', back: 'Back', core: 'Core', shoulders: 'Shoulders' };
            return <Text key={muscle} style={styles.secondary}>{labels[muscle]} · {sets} {t.sets}</Text>;
          })}
        </Card>}
        <Card title={t.weeklyNutrition} icon="nutrition">
          {current.nutrition ? <NutritionSummary key={week.start} week={week} report={current.nutrition} />
            : <Text style={styles.secondary}>{t.weeklyReadFailed}</Text>}
        </Card>
        <Card title={t.weeklyMeasurements} icon="scale">
          {current.body ? current.body.map(({ metric, points, latest, difference }) => (
            <View key={metric} style={reportStyles.measurement}>
              <Stat label={t[metric]} value={latest === null ? '—'
                : `${measurementText(latest, metric, current.units)} ${measurementUnit(metric, current.units)}`} />
              <Text style={styles.secondary}>{difference === null ? t[points ? 'weeklyNeedMeasurements' : 'weeklyNoMeasurement']
                : `${t.weeklyFirstToLast} · ${difference > 0 ? '+' : ''}${measurementText(difference, metric, current.units)} ${measurementUnit(metric, current.units)}`}</Text>
            </View>
          )) : <Text style={styles.secondary}>{t.weeklyReadFailed}</Text>}
        </Card>
        <Card title={t.weeklyRecovery} icon="recovery">
          {!current.recovery ? <Text style={styles.secondary}>{t.weeklyReadFailed}</Text>
            : current.recovery.latest ? <>
              <Text style={styles.secondary}>{t.weeklyLatestReview} · {stamp.format(new Date(current.recovery.latest.recordedAt))}</Text>
              <View style={styles.row}>
                <Stat label={t.weeklySleep} value={t[`recovery_${current.recovery.latest.feedback.sleep}`]} />
                <Stat label={t.weeklyFatigue} value={t[`recovery_${current.recovery.latest.feedback.fatigue}`]} />
                <Stat label={t.weeklySoreness} value={t[`recovery_${current.recovery.latest.feedback.soreness}`]} />
              </View>
            </> : <Text style={styles.secondary}>{t.weeklyNoRecovery}</Text>}
        </Card>
        {offset === 0 && <Card title={t.weeklyNextSteps}>
          <View style={styles.row}>
            <SecondaryButton label={t.openWorkout} icon="workout" onPress={() => router.navigate('/explore')} />
            <SecondaryButton label={t.weeklyNextFood} icon="nutrition"
              onPress={() => router.navigate({ pathname: '/nutrition', params: { quick: '1' } })} />
          </View>
        </Card>}
        {failed && <Action label={t.retry} onPress={load} />}
        <Text style={styles.secondary}>{t.weeklyGenerated} · {stamp.format(current.generatedAt)} · v{weeklyReportVersion}</Text>
      </>}
    </Page>
  );
}

function TrainingSummary({ week, report }: { week: ReportWeek; report: NonNullable<Report['training']> }) {
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState(week.observedDays.length - 1);
  const last = report.previousSets;
  const change = report.sets - last;
  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' });
  return (
    <>
      <View style={reportStyles.metrics}>
        <Stat label={t.weeklyWorkouts} value={String(report.sessions)} />
        <Stat label={t.weeklyWorkingSets} value={String(report.sets)} />
        <Stat label={t.weeklyRecordDays} value={String(report.recordDays.length)} />
      </View>
      <WeekBars week={week} values={report.dailySets} selected={selected} onSelect={setSelected}
        label={t.weeklyWorkingSets} color={colors.accent} />
      <Text style={styles.secondary}>{date.format(dayDate(week.days[selected]))} · {t.weeklyWorkingSets} {report.dailySets[selected]}</Text>
      <Text style={styles.secondary}>{report.hasPrevious ? `${t.weeklyCompare} · ${last} → ${report.sets} (${change > 0 ? '+' : ''}${change})`
        : t.weeklyNoComparison}</Text>
      {report.planProgress ? <>
        <Text style={styles.body}>{t.weeklyPlanSlots} · {report.planProgress.done} / {report.planProgress.due}</Text>
        <Track value={report.planProgress.done} target={report.planProgress.due} />
      </> : <Text style={styles.secondary}>{t.weeklyNoPlan}</Text>}
      {report.recordDays.length > 0 &&
        <Text style={styles.secondary}>{t.weeklyRecordDays} · {report.recordDays.map((day) => date.format(dayDate(day))).join(' · ')}</Text>}
    </>
  );
}

function NutritionSummary({ week, report }: { week: ReportWeek; report: NonNullable<Report['nutrition']> }) {
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState(week.observedDays.length - 1);
  const number = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' });
  const day = report.days[selected];
  return (
    <>
      <Text style={styles.headline}>{report.loggedDays} / {week.observedDays.length} {t.weeklyFoodDays}</Text>
      <WeekBars week={week} values={report.days.map((value) => value ? 1 : 0)} selected={selected}
        onSelect={setSelected} label={t.weeklyFoodLog} color={colors.warm} />
      <Text style={styles.secondary}>{date.format(dayDate(week.days[selected]))} · {
        day ? `${number.format(day.kcal)} kcal · ${t.protein} ${number.format(day.protein)} g` : t.weeklyNoFood
      }</Text>
      {report.average && <Text style={styles.secondary}>{t.weeklyRecordedAverage} · {number.format(report.average.kcal)} kcal
        {' · '}{t.protein} {number.format(report.average.protein)} g</Text>}
    </>
  );
}

function WeekBars({ week, values, selected, label, color, onSelect }: {
  week: ReportWeek; values: number[]; selected: number; label: string; color: string; onSelect: (index: number) => void;
}) {
  const { language, t } = useLanguage();
  const dayLabel = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { weekday: 'short' });
  const accessibleDate = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'full' });
  const max = Math.max(1, ...values);
  return (
    <View style={reportStyles.days} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {week.days.map((day, index) => {
        const future = day > week.through;
        const active = selected === index;
        const value = values[index];
        return (
          <Pressable key={day} accessibilityRole="radio" accessibilityState={{ checked: active, disabled: future }}
            accessibilityLabel={`${accessibleDate.format(dayDate(day))} · ${future ? t.weeklyUpcoming : `${label} ${value}`}`}
            disabled={future} onPress={() => onSelect(index)}
            style={[reportStyles.day, active && reportStyles.selected, future && styles.disabled]}>
            <View style={reportStyles.barTrack}>
              {value > 0 && <View style={[reportStyles.bar, { backgroundColor: color, height: `${value / max * 100}%` }]} />}
            </View>
            <Text numberOfLines={1} style={reportStyles.dayLabel}>{dayLabel.format(dayDate(day))}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PerformanceCard({ week, series, units }: { week: ReportWeek; series: PerformanceSeries[]; units: MeasurementUnits }) {
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState<Exercise>();
  const [showAll, setShowAll] = useState(false);
  const row = series.find((entry) => entry.exercise === selected) ?? series[0];
  const unit = row?.metric === 'load' ? weightLabel(units) : t[row?.metric === 'seconds' ? 'planSeconds' : 'reps'];
  const caption = t[row?.metric === 'load' ? 'weeklyPeakLoad' : row?.metric === 'seconds' ? 'weeklyBestTime' : 'weeklyBestReps'];
  const number = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' });
  const points = row?.points.map(({ day, value }) => ({
    day,
    value: row?.metric === 'load' ? Number(displaySetWeight(value, units)) : value,
    fraction: (dayNumber(day) - dayNumber(week.previousStart)) / (dayNumber(week.through) - dayNumber(week.previousStart)),
  })) ?? [];
  const latest = points.at(-1);
  return (
    <Card title={t.weeklyPerformance} icon="progress">
      {row && latest ? <>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.workoutMovement}>
          {series.slice(0, showAll ? series.length : 5).map(({ exercise }) => (
            <Choice key={exercise} label={t[exercise]} selected={exercise === row.exercise} disabled={false}
              onPress={() => setSelected(exercise)} />
          ))}
        </View>
        {series.length > 5 && <SecondaryButton label={t[showAll ? 'weeklyFewerExercises' : 'weeklyMoreExercises']}
          onPress={() => {
            if (showAll && !series.slice(0, 5).includes(row)) setSelected(undefined);
            setShowAll(!showAll);
          }} />}
        <Stat label={`${caption} · ${date.format(dayDate(latest.day))}`} value={`${number.format(latest.value)} ${unit}`} />
        {points.length >= 2 ? <>
          <View style={reportStyles.plot}><ProgressPlot points={points} unit={unit}
            description={`${t[row.exercise]} · ${points.map(({ day, value }) => `${date.format(dayDate(day))} ${number.format(value)} ${unit}`).join(' · ')}`} /></View>
          <Text style={styles.secondary}>{date.format(dayDate(week.previousStart))} – {date.format(dayDate(week.through))}
            {' · '}{t.weeklyPerformanceSource}</Text>
        </> : <Text style={styles.secondary}>{t.weeklyNeedPerformance}</Text>}
      </> : <Text style={styles.secondary}>{t.weeklyNoPerformance}</Text>}
    </Card>
  );
}

const reportStyles = StyleSheet.create({
  metrics: { ...styles.row, backgroundColor: colors.background, borderRadius: 14, padding: 12 },
  days: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, minWidth: 0, alignItems: 'center', minHeight: 61, gap: 5, borderRadius: 9,
    paddingHorizontal: 3, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  selected: { borderColor: colors.accent },
  dayLabel: { color: colors.muted, fontSize: 10 },
  barTrack: { width: '62%', height: 31, justifyContent: 'flex-end', backgroundColor: colors.track, borderRadius: 4, overflow: 'hidden' },
  bar: { borderRadius: 4, minHeight: 2 },
  plot: { borderRadius: 14, backgroundColor: colors.background, padding: 10, overflow: 'hidden' },
  measurement: { gap: 4, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 8 },
});

import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLanguage } from './language';
import type { ProfileRevision } from './profile';
import { savePlan } from './profile-store';
import { Action, Card, Choice, colors, Page, SecondaryButton, styles } from './ui';
import { weekdays } from './workout-log';
import {
  availablePlanDays, availablePlanEquipment, buildPlan, exerciseRest, exerciseSeconds, type PlanDays, type PlanEquipment,
  type PlanRevision, type WorkoutPlan,
} from './workout-plan';

export function PlanSchedule({ plan, onStart, onCheck, sessionLabel, startDisabled }: {
  plan: WorkoutPlan; onStart?: (day: number) => void; onCheck?: (day: number) => void;
  sessionLabel?: (day: number) => string | undefined; startDisabled?: boolean;
}) {
  const { t } = useLanguage();
  const [guideOpen, setGuideOpen] = useState(false);
  const showGuide = !onStart || guideOpen;
  return (
    <>
      <Card title={t.planGuidance} icon="calendar"
        headerAction={onStart ? <SecondaryButton label={t[guideOpen ? 'planHideGuidance' : 'planShowGuidance']}
          onPress={() => setGuideOpen(!guideOpen)} /> : undefined}>
        {showGuide && (
          <>
            <Text style={styles.body}>{t[plan.goal]} · {t[plan.experience]} · {t[plan.equipment]}</Text>
            <Text style={styles.secondary}>{t.planWarmup} · {plan.warmupMinutes} {t.planMinutes}</Text>
            <Text style={styles.secondary}>{t.planIntensity} · {plan.rir} {t.planRepsInReserve}</Text>
            <Text style={styles.secondary}>{t.planSafety}</Text>
          </>
        )}
      </Card>
      {plan.sessions.map((session) => (
        <Card key={session.day} title={t[weekdays[session.day - 1]]} icon="workout" tone={session.focus && session.focus !== 'balanced' ? 'accent' : undefined}>
          <Text style={styles.secondary}>
            {t[session.focus ?? 'balanced']} · {t.planAbout} {session.minutes} {t.planMinutes}
          </Text>
          {sessionLabel && <Text style={styles.body}>{sessionLabel(session.day)}</Text>}
          {onStart && <View style={styles.row}>
            <Action label={t.workoutStart} icon="arrow" disabled={startDisabled} onPress={() => onStart(session.day)} />
            {onCheck && <SecondaryButton label={t.checkTitle} disabled={startDisabled} onPress={() => onCheck(session.day)} />}
          </View>}
          {session.exercises.map(({ name, alternative }, index) => (
            <View key={name} style={planStyles.exercise}>
              <Text style={styles.body}>{index + 1}. {t[name]}</Text>
              <Text style={styles.secondary}>{session.sets} {t.sets} × {exerciseSeconds(name) ?
                `${exerciseSeconds(name)} ${t.planSeconds}` : `${plan.minReps}–${plan.maxReps} ${t.reps}`} · {t.planRest} {exerciseRest(name)} {t.planSeconds}</Text>
              {alternative && <Text style={styles.secondary}>{t.planAlternative} · {t[alternative]}</Text>}
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

export function PlanEditor({ revision, previous, onAccepted, onStale, onCancel, compact }: {
  revision: ProfileRevision;
  previous: PlanRevision | null;
  onAccepted: (plan: PlanRevision) => void;
  onStale: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const dayOptions = availablePlanDays(revision.profile.days);
  const gearOptions = availablePlanEquipment(revision.profile.venue);
  const [days, setDays] = useState<PlanDays>(() => {
    const prior = previous?.plan.days;
    return prior && dayOptions.includes(prior) ? prior : (dayOptions.at(-1) ?? 1);
  });
  const [equipment, setEquipment] = useState<PlanEquipment>(() => {
    const prior = previous?.plan.equipment;
    const preferred = revision.profile.preferredEquipment ?? prior;
    return preferred && gearOptions.includes(preferred) ? preferred : 'bodyweight';
  });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [adjusting, setAdjusting] = useState(!compact);
  const pending = useRef(false);
  const plan = buildPlan(revision.profile, days, equipment);

  async function accept() {
    if (!plan || pending.current) return;
    pending.current = true;
    setSaving(true);
    setFailed(false);
    let accepted: PlanRevision | null;
    try {
      accepted = await savePlan(plan, revision.savedAt);
    } catch {
      pending.current = false;
      setSaving(false);
      setFailed(true);
      return;
    }
    if (accepted) onAccepted(accepted);
    else onStale();
  }

  return (
    <Page title={t.planPreview} icon="calendar" footer={
      <View style={styles.row}>
        <Action label={t[saving ? 'profileSaving' : 'planAccept']} disabled={saving || !plan} onPress={() => { void accept(); }} />
        <SecondaryButton label={t.profileCancel} disabled={saving} onPress={onCancel} />
      </View>
    }>
      <Card title={t.initialPlan} icon="calendar" tone="accent">
        <Text style={styles.secondary}>{t.planPreviewHint}</Text>
        <Text style={styles.body}>{days} {t.daysPerWeek} · {t[equipment]}</Text>
        <SecondaryButton label={t[adjusting ? 'planHideGuidance' : 'planAdjust']}
          disabled={saving} onPress={() => setAdjusting((open) => !open)} />
        {adjusting && <>
          <Text style={styles.body}>{t.planDays}</Text>
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.planDays}>
            {dayOptions.map((option) => (
              <Choice key={option} label={String(option)} selected={option === days}
                disabled={saving} onPress={() => setDays(option)} />
            ))}
          </View>
          <Text style={styles.body}>{t.equipment}</Text>
          <Text style={styles.secondary}>{t.planGearHint} {revision.profile.equipment}</Text>
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.equipment}>
            {gearOptions.map((option) => (
              <Choice key={option} label={t[option]} selected={option === equipment}
                disabled={saving} onPress={() => setEquipment(option)} />
            ))}
          </View>
        </>}
      </Card>
      {failed && <Text accessibilityRole="alert" style={styles.secondary}>{t.planSaveFailed}</Text>}
      {plan && <PlanSchedule plan={plan} />}
    </Page>
  );
}

const planStyles = StyleSheet.create({
  exercise: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 3 },
});

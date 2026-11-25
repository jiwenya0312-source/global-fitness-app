import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { playHaptic } from './haptics';
import { Pressable } from './pressable';

import { useLanguage } from './language';
import {
  displayMeasurement, experiences, focuses, goals, inchesToCm, inRange, limitations,
  parseDecimal, poundsToKg, units, venues, type BodyProfile, type ProfileRevision,
} from './profile';
import { saveProfile } from './profile-store';
import { readPreference, writePreference } from './quick-preferences';
import { Action, Card, Choice, colors, SecondaryButton, styles, Track, usePageScroll } from './ui';
import { availablePlanEquipment, type PlanEquipment } from './workout-plan';

type Draft = Omit<BodyProfile, 'age' | 'heightCm' | 'weightKg' | 'days' | 'minutes' |
  'goal' | 'experience' | 'venue' | 'limitations'> & {
  age: string;
  height: string;
  weight: string;
  days: string;
  minutes: string;
  goal: BodyProfile['goal'] | '';
  experience: BodyProfile['experience'] | '';
  venue: BodyProfile['venue'] | '';
  limitations: BodyProfile['limitations'] | '';
};
const draftKey = 'fitness.setup-draft.v1';
const fieldErrors = {
  goal: 'profileGoalRequired', experience: 'profileExperienceRequired', venue: 'profileVenueRequired',
  days: 'profileDaysInvalid', minutes: 'profileMinutesInvalid', age: 'profileAgeInvalid',
  height: 'profileHeightInvalid', weight: 'profileWeightInvalid', limitations: 'profileLimitationsRequired',
} as const;
type RequiredField = keyof typeof fieldErrors;
type FieldRefs = Partial<Record<keyof Draft, ComponentRef<typeof View> | null>>;

function RevealProfileField({ issue, fields }: { issue?: { field: RequiredField }; fields: { current: FieldRefs } }) {
  const scrollToField = usePageScroll();
  useEffect(() => {
    if (!issue) return;
    const frame = requestAnimationFrame(() => {
      const field = fields.current[issue.field];
      if (field) scrollToField(field);
    });
    return () => cancelAnimationFrame(frame);
  }, [issue, fields, scrollToField]);
  return null;
}

function createDraft(profile?: BodyProfile): Draft {
  const imperial = profile?.units === 'imperial';
  return {
    age: profile ? String(profile.age) : '',
    height: profile ? displayMeasurement(profile.heightCm, imperial ? inchesToCm : 1) : '',
    weight: profile ? displayMeasurement(profile.weightKg, imperial ? poundsToKg : 1) : '',
    days: profile ? String(profile.days) : '3',
    minutes: profile ? String(profile.minutes) : '30',
    units: profile?.units ?? 'metric',
    goal: profile?.goal ?? '',
    experience: profile?.experience ?? '',
    venue: profile?.venue ?? '',
    equipment: profile?.equipment ?? '',
    limitations: profile?.limitations ?? '',
    notes: profile?.notes ?? '',
    allowSuggestions: profile?.allowSuggestions ?? false,
    focus: profile?.focus ?? 'balanced',
    secondaryFocus: profile?.secondaryFocus ?? 'balanced',
    preferredEquipment: profile?.preferredEquipment ?? 'bodyweight',
  };
}

function convert(input: string, multiplier: number) {
  const value = parseDecimal(input);
  return Number.isFinite(value) ? displayMeasurement(value, multiplier) : input;
}

export function ProfileForm({ initial, onSaved, onCancel, onboarding = false, frame }: {
  initial?: BodyProfile;
  onSaved: (revision: ProfileRevision) => void;
  onCancel?: () => void;
  onboarding?: boolean;
  frame?: (body: ReactNode, actions: ReactNode, step: number) => ReactNode;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(() => createDraft(initial));
  const [error, setError] = useState<keyof typeof t>();
  const [issue, setIssue] = useState<{ field: RequiredField }>();
  const [saving, setSaving] = useState(false);
  const [slowSave, setSlowSave] = useState(false);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(!onboarding);
  const writeQueue = useRef(Promise.resolve());
  const savePending = useRef(false);
  const fields = useRef<FieldRefs>({});
  const imperial = draft.units === 'imperial';

  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSlowSave(true), 6000);
    return () => clearTimeout(timer);
  }, [saving]);

  useEffect(() => {
    if (!onboarding) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      setLoaded(true);
    }, 2000);
    void readPreference(draftKey).then((raw) => {
      if (!active || !raw) return;
      const saved = JSON.parse(raw) as { draft?: Partial<Draft>; step?: number };
      if (saved.draft) setDraft({ ...createDraft(initial), ...saved.draft });
      if (saved.step === 1 || saved.step === 2) setStep(saved.step);
    }).catch(() => {}).finally(() => {
      clearTimeout(timer);
      if (active) setLoaded(true);
    });
    return () => { active = false; clearTimeout(timer); };
  }, [initial, onboarding]);

  useEffect(() => {
    if (!onboarding || !loaded || saving) return;
    const value = JSON.stringify({ draft, step });
    writeQueue.current = writeQueue.current.then(() => writePreference(draftKey, value)).catch(() => {});
  }, [draft, step, loaded, onboarding, saving]);

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(undefined);
    if (issue?.field === field) setIssue(undefined);
  }

  function showIssue(field: RequiredField, targetStep: number) {
    playHaptic('error');
    Keyboard.dismiss();
    setIssue({ field });
    if (onboarding) setStep(targetStep);
  }

  function fieldMessage(field: keyof Draft) {
    return issue?.field === field && <Text accessibilityRole="alert" style={formStyles.error}>
      {t[fieldErrors[issue.field]]}
    </Text>;
  }

  function changeUnits(next: BodyProfile['units']) {
    setDraft((current) => {
      if (next === current.units) return current;
      const toImperial = next === 'imperial';
      return {
        ...current, units: next,
        height: convert(current.height, toImperial ? inchesToCm : 1 / inchesToCm),
        weight: convert(current.weight, toImperial ? poundsToKg : 1 / poundsToKg),
      };
    });
  }

  function input(field: 'age' | 'height' | 'weight' | 'days' | 'minutes' | 'equipment' | 'notes',
    label: string, inputMode: 'numeric' | 'decimal' | 'text', maxLength = 12) {
    return (
      <View ref={(node) => { fields.current[field] = node; }} collapsable={false} style={formStyles.field}>
        <Text style={styles.body}>{label}</Text>
        <TextInput accessibilityLabel={label} value={draft[field]}
          onChangeText={(value) => update(field, value)} inputMode={inputMode}
          editable={!saving} maxLength={maxLength}
          multiline={inputMode === 'text'} style={[formStyles.input, issue?.field === field && formStyles.invalid]} />
        {fieldMessage(field)}
      </View>
    );
  }

  function choices<K extends 'goal' | 'experience' | 'venue' | 'limitations' | 'units'>(
    field: K, label: string, options: readonly Exclude<Draft[K], ''>[],
  ) {
    return (
      <View ref={(node) => { fields.current[field] = node; }} collapsable={false} style={formStyles.field}>
        <Text style={styles.body}>{label}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={formStyles.options}>
          {options.map((option) => {
            const selected = draft[field] === option;
            return (
              <Pressable key={option} accessibilityRole="radio" disabled={saving}
                accessibilityState={{ checked: selected, disabled: saving }}
                onPress={() => field === 'units' ? changeUnits(option as BodyProfile['units']) : update(field, option)}
                style={[formStyles.option, selected && formStyles.selected]}>
                <Text style={[styles.body, selected && formStyles.selectedText]}>{t[option]}</Text>
              </Pressable>
            );
          })}
        </View>
        {fieldMessage(field)}
      </View>
    );
  }

  function next() {
    if (step === 0 && !draft.goal) return showIssue('goal', 0);
    if (step === 0 && !draft.experience) return showIssue('experience', 0);
    if (step === 1 && !draft.venue) return showIssue('venue', 1);
    if (step === 1 && !inRange(parseDecimal(draft.days), 1, 7, true)) return showIssue('days', 1);
    if (step === 1 && !inRange(parseDecimal(draft.minutes), 1, 1440, true)) return showIssue('minutes', 1);
    setIssue(undefined);
    setStep(step + 1);
    playHaptic('selection');
  }

  const gear = draft.venue ? availablePlanEquipment(draft.venue) : [];
  const preferredEquipment: PlanEquipment = draft.preferredEquipment && gear.includes(draft.preferredEquipment)
    ? draft.preferredEquipment : 'bodyweight';

  async function save() {
    if (savePending.current) return;
    const age = parseDecimal(draft.age);
    const heightCm = parseDecimal(draft.height) * (imperial ? inchesToCm : 1);
    const weightKg = parseDecimal(draft.weight) * (imperial ? poundsToKg : 1);
    const days = parseDecimal(draft.days);
    const minutes = parseDecimal(draft.minutes);
    const { goal, experience, venue, limitations: currentLimitations } = draft;

    if (!goal) return showIssue('goal', 0);
    if (!experience) return showIssue('experience', 0);
    if (!venue) return showIssue('venue', 1);
    if (!inRange(days, 1, 7, true)) return showIssue('days', 1);
    if (!inRange(minutes, 1, 1440, true)) return showIssue('minutes', 1);
    if (!inRange(age, 1, 120, true)) return showIssue('age', 2);
    if (!inRange(heightCm, 30, 300)) return showIssue('height', 2);
    if (!inRange(weightKg, 1, 700)) return showIssue('weight', 2);
    if (!currentLimitations) return showIssue('limitations', 2);

    savePending.current = true;
    setSaving(true);
    setSlowSave(false);
    setError(undefined);
    setIssue(undefined);
    Keyboard.dismiss();
    let revision: ProfileRevision;
    try {
      revision = await saveProfile({
        age, heightCm, weightKg, days, minutes, goal, experience, venue, limitations: currentLimitations,
        units: draft.units, equipment: draft.equipment.trim(), preferredEquipment,
        focus: draft.focus, secondaryFocus: draft.focus === draft.secondaryFocus
          || draft.focus === 'balanced' ? 'balanced' : draft.secondaryFocus,
        notes: currentLimitations === 'hasLimitations' ? draft.notes.trim() : '',
        allowSuggestions: draft.allowSuggestions,
      });
    } catch {
      savePending.current = false;
      setSaving(false);
      setError('profileSaveError');
      playHaptic('error');
      return;
    }
    if (onboarding) {
      void writeQueue.current.then(() => writePreference(draftKey, '')).catch(() => {});
    }
    playHaptic('success');
    onSaved(revision);
  }

  if (!loaded) {
    const loading = <Text style={styles.secondary}>{t.profileLoading}</Text>;
    return frame ? frame(loading, null, step) : loading;
  }

  const goalCard = (
    <Card title={t.trainingGoal} icon="workout" tone="accent">
      {choices('goal', t.goal, goals)}
      {choices('experience', t.experience, experiences)}
      <Text style={styles.body}>{t.focusLabel}</Text>
      <View style={styles.row}>
        {focuses.map((focus) => <Choice key={focus} label={t[focus]} selected={draft.focus === focus}
          disabled={saving} onPress={() => update('focus', focus)} />)}
      </View>
      {draft.focus !== 'balanced' && (
        <>
          <Text style={styles.body}>{t.focusSecondary}</Text>
          <View style={styles.row}>
            {focuses.filter((focus) => focus !== draft.focus).map((focus) => (
              <Choice key={focus} label={t[focus === 'balanced' ? 'focusNone' : focus]}
                selected={draft.secondaryFocus === focus || (focus === 'balanced' && draft.secondaryFocus === draft.focus)}
                disabled={saving} onPress={() => update('secondaryFocus', focus)} />
            ))}
          </View>
        </>
      )}
    </Card>
  );

  const body = (
    <>
      <RevealProfileField issue={issue} fields={fields} />
      {onboarding && (
        <Card title={t[(['setupGoal', 'setupSchedule', 'setupBody'] as const)[step]]} icon="profile" tone="accent">
          <Text style={styles.secondary}>{step + 1} / 3</Text>
          <Track value={step + 1} target={3} />
        </Card>
      )}
      {(!onboarding || step === 0) && goalCard}
      {(!onboarding || step === 1) && <Card title={t.setupSchedule} icon="calendar">
        {choices('venue', t.venue, venues)}
        {gear.length > 0 && <>
          <Text style={styles.body}>{t.equipment}</Text>
          <View style={styles.row}>
            {gear.map((option) => <Choice key={option} label={t[option]} selected={preferredEquipment === option}
              disabled={saving} onPress={() => update('preferredEquipment', option)} />)}
          </View>
        </>}
        <Text style={styles.body}>{t.frequency}</Text>
        <View ref={onboarding ? (node) => { fields.current.days = node; } : undefined}
          collapsable={false} style={styles.row}>
          {[1, 2, 3, 4].map((days) => <Choice key={days} label={String(days)}
            selected={draft.days === String(days)} disabled={saving} onPress={() => update('days', String(days))} />)}
        </View>
        {onboarding && fieldMessage('days')}
        {!onboarding && input('days', t.frequency, 'numeric', 1)}
        <Text style={styles.body}>{t.sessionMinutes}</Text>
        <View ref={onboarding ? (node) => { fields.current.minutes = node; } : undefined}
          collapsable={false} style={styles.row}>
          {[15, 30, 45, 60].map((minutes) => <Choice key={minutes} label={`${minutes} ${t.planMinutes}`}
            selected={draft.minutes === String(minutes)} disabled={saving} onPress={() => update('minutes', String(minutes))} />)}
        </View>
        {onboarding && fieldMessage('minutes')}
        {!onboarding && input('minutes', t.sessionMinutes, 'numeric', 4)}
        {!onboarding && input('equipment', t.equipmentHint, 'text', 200)}
      </Card>}
      {(!onboarding || step === 2) && <><Card title={t.basicInfo}>
        {choices('units', t.measurementUnits, units)}
        {input('age', t.age, 'numeric')}
        {input('height', `${t.height} (${imperial ? 'in' : 'cm'})`, 'decimal')}
        {input('weight', `${t.weight} (${imperial ? 'lb' : 'kg'})`, 'decimal')}
        {onboarding && <Text style={styles.secondary}>{t.setupNumbersHint}</Text>}
      </Card>
      <Card title={t.safetyInfo}>
        {choices('limitations', t.limitationsLabel, limitations)}
        {draft.limitations === 'hasLimitations' && input('notes', t.limitNotes, 'text', 300)}
        <View style={formStyles.permission}>
          <Text style={[styles.body, formStyles.permissionLabel]}>{t.allowSuggestions}</Text>
          <Switch accessibilityLabel={t.allowSuggestions} value={draft.allowSuggestions}
            disabled={saving} onValueChange={(value) => update('allowSuggestions', value)}
            trackColor={{ true: colors.accent }} />
        </View>
        <Text style={styles.secondary}>{t.localProfileHint}</Text>
      </Card></>}
    </>
  );
  const actions = (
    <View style={formStyles.field}>
      {issue && frame && <Text style={formStyles.error}>{t[fieldErrors[issue.field]]}</Text>}
      {error && <Text accessibilityRole="alert" style={formStyles.error}>{t[error]}</Text>}
      <View style={styles.row}>
        {saving ? <Text accessibilityRole="alert" style={styles.secondary}>{t[slowSave ? 'profileSaveSlow' : 'profileSaving']}</Text> : (
          <>
            <Action label={t[onboarding ? step < 2 ? 'setupNext' : 'setupSaveEnter' : 'profileSave']}
              onPress={onboarding && step < 2 ? next : () => { void save(); }} />
            {onboarding && step > 0 && <SecondaryButton label={t.setupBack} onPress={() => {
              setError(undefined);
              setIssue(undefined);
              setStep(step - 1);
            }} />}
            {onCancel && <Pressable accessibilityRole="button" style={formStyles.option} onPress={onCancel}>
              <Text style={styles.body}>{t.profileCancel}</Text>
            </Pressable>}
          </>
        )}
      </View>
    </View>
  );
  return frame ? frame(body, actions, step) : <>{body}{actions}</>;
}

const formStyles = StyleSheet.create({
  field: { gap: 8 },
  input: { color: colors.text, backgroundColor: colors.background, minHeight: 48,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderColor: colors.border, borderWidth: 1, borderRadius: 10 },
  selected: { borderColor: colors.accent, backgroundColor: colors.activeSurface },
  selectedText: { color: colors.accent, fontWeight: '700' },
  permission: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permissionLabel: { flex: 1 },
  error: { color: '#FFAAA2', fontSize: 15 },
  invalid: { borderColor: colors.rose },
});

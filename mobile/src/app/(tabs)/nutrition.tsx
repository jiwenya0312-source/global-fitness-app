import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { playHaptic } from '@/fitness/haptics';
import { Pressable } from '@/fitness/pressable';

import { useAccount } from '@/auth/account-provider';
import { goalsKey, visibleNutrition, type NutritionWorkspace } from '@/fitness/account-nutrition';
import {
  deleteAccountFood, readAccountRecentFoods, readNutritionWorkspace, saveAccountFood, saveAccountGoals, saveAccountMeal,
} from '@/fitness/account-nutrition-store';
import { AccountNutritionSync } from '@/fitness/account-nutrition-sync';
import { dayDate, isDay, localDay, shiftDay } from '@/fitness/calendar';
import { Icon } from '@/fitness/icons';
import { useLanguage } from '@/fitness/language';
import { copyMealFood, type MealTemplate } from '@/fitness/meal-templates';
import { MealTemplatesPanel } from '@/fitness/meal-templates-panel';
import {
  dailyTotals, foodTotal, latestEarlierMeal, meals, roundAmount,
  type EarlierMeal, type Food, type FoodEntry, type Meal, type NutritionDay, type NutritionGoals,
} from '@/fitness/nutrition';
import {
  FoodEditor, GoalsEditor, amountUnits,
} from '@/fitness/nutrition-form';
import {
  deleteNutritionEntry, readDeviceNutrition, readNutritionDay, readRecentFoods, saveNutritionEntry, saveNutritionGoals,
  saveNutritionMeal,
} from '@/fitness/nutrition-store';
import { QuickFood } from '@/fitness/quick-food';
import { Action, Card, colors, InputField, Page, SecondaryButton, styles, Track } from '@/fitness/ui';

const macroKeys = ['protein', 'carbs', 'fat'] as const;
const macroColors = { protein: colors.cool, carbs: colors.warm, fat: colors.rose };

type Screen =
  | { kind: 'log' }
  | { kind: 'food'; day: string; meal: Meal; entry?: FoodEntry }
  | { kind: 'quick'; day: string; meal: Meal }
  | { kind: 'templates'; day: string; meal: Meal; fromQuick?: boolean; seed?: Food[]; template?: MealTemplate; copiedMeal?: EarlierMeal }
  | { kind: 'goals'; current: NutritionGoals | null }
  | { kind: 'date'; day: string };

type DayState =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; day: string; data: NutritionDay; workspace?: NutritionWorkspace };

export default function Nutrition() {
  const { state } = useAccount();
  const accountId = state.status === 'signedIn' ? state.userId : undefined;
  return <NutritionArea key={accountId ?? 'device'} accountId={accountId} />;
}

function NutritionArea({ accountId }: { accountId?: string }) {
  const [open, setOpen] = useState(false);
  return open && accountId
    ? <NutritionLog key="account" owner={accountId} switchLog={() => setOpen(false)} />
    : <NutritionLog key="device" switchLog={accountId ? () => setOpen(true) : undefined} />;
}

function NutritionLog({ owner, switchLog }: { owner?: string; switchLog?: () => void }) {
  const router = useRouter();
  const { quick } = useLocalSearchParams<{ quick?: string }>();
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [today, setToday] = useState(localDay);
  const [screen, setScreen] = useState<Screen>({ kind: 'log' });
  const [state, setState] = useState<DayState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState<'write' | 'stale'>();
  const request = useRef(0);
  const pending = useRef(false);
  const quickOpened = useRef(false);

  const load = useCallback((selection: string | null) => {
    const current = localDay();
    setToday(current);
    const day = selection && selection <= current ? selection : current;
    const id = ++request.current;
    setState({ status: 'loading' });
    const reading = owner
      ? readNutritionWorkspace(owner).then((workspace) => ({ data: visibleNutrition(workspace, day), workspace }))
      : readNutritionDay(day).then((data) => ({ data }));
    reading.then((result) => {
      if (id === request.current) setState({ status: 'ready', day, ...result });
    }, () => {
      if (id === request.current) setState({ status: 'failed' });
    });
  }, [owner]);

  const loadAccountRecent = useCallback(() => owner ? readAccountRecentFoods(owner) : Promise.resolve([]), [owner]);

  useFocusEffect(useCallback(() => {
    load(selected);
    return () => { request.current += 1; };
  }, [load, selected]));

  useFocusEffect(useCallback(() => {
    if (quick !== '1') {
      quickOpened.current = false;
      return;
    }
    if (quickOpened.current) return;
    quickOpened.current = true;
    const hour = new Date().getHours();
    setSelected(null);
    setScreen({ kind: 'quick', day: localDay(), meal: hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : 'dinner' });
    router.setParams({ quick: '0' });
  }, [quick, router]));

  function close() {
    setError(undefined);
    setScreen({ kind: 'log' });
  }

  function selectDay(day: string | null) {
    const selection = day === localDay() ? null : day;
    close();
    if (selection === selected) load(selection);
    else setSelected(selection);
  }

  async function save(write: () => Promise<boolean>) {
    if (pending.current || error === 'stale') return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (!await write()) {
        setError('stale');
        playHaptic('error');
        return;
      }
      Keyboard.dismiss();
      playHaptic('success');
      close();
      load(selected);
    } catch {
      setError('write');
      playHaptic('error');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const blocked = busy || error === 'stale';

  let content;
  if (screen.kind === 'templates') {
    const { day, meal, seed, fromQuick, template, copiedMeal } = screen;
    content = <MealTemplatesPanel owner={owner} initialMeal={meal} useTargetMeal={fromQuick} seed={seed}
      initialTemplate={template} copiedMeal={copiedMeal} targetDay={day} busy={blocked}
      loadRecent={owner ? loadAccountRecent : readRecentFoods}
      onClose={() => {
        if (fromQuick) setScreen({ kind: 'quick', day, meal });
        else close();
      }}
      onUse={(foods) => { void save(() => owner ? saveAccountMeal(owner, day, foods) : saveNutritionMeal(day, foods)); }} />;
  } else if (screen.kind === 'quick') {
    const { day, meal } = screen;
    content = <QuickFood initialMeal={meal} owner={owner} busy={blocked} onCancel={close}
      loadRecent={owner ? loadAccountRecent : readRecentFoods}
      onTemplates={(meal, template) => setScreen({ kind: 'templates', day, meal, fromQuick: true, template })}
      onManual={(meal) => setScreen({ kind: 'food', day, meal })}
      onSave={(food) => { void save(() => owner ? saveAccountFood(owner, day, food) : saveNutritionEntry(day, food)); }}
      onRepeat={async (meal) => {
        const source = owner ? visibleNutrition(await readNutritionWorkspace(owner)) : await readDeviceNutrition();
        const copiedMeal = latestEarlierMeal(source.entries, day, meal);
        if (!copiedMeal) return false;
        setScreen((current) => current === screen
          ? { kind: 'templates', day, meal, fromQuick: true, copiedMeal } : current);
        return true;
      }} />;
  } else if (screen.kind === 'food') {
    content = <FoodEditor meal={screen.meal} initial={screen.entry} busy={blocked} onCancel={close}
      loadRecent={owner ? loadAccountRecent : undefined}
      onSave={(food) => { void save(() => owner ? saveAccountFood(owner, screen.day, food, screen.entry)
        : saveNutritionEntry(screen.day, food, screen.entry)); }}
      onDelete={() => {
        if (screen.entry) {
          const entry = screen.entry;
          void save(() => owner ? deleteAccountFood(owner, entry) : deleteNutritionEntry(entry));
        }
      }} />;
  } else if (screen.kind === 'goals') {
    content = <GoalsEditor initial={screen.current?.values} busy={blocked} onCancel={close}
      onSave={(values) => { void save(() => owner ? saveAccountGoals(owner, values, screen.current)
        : saveNutritionGoals(values, screen.current)); }} />;
  } else if (screen.kind === 'date') {
    content = <DateEditor initial={screen.day} onChoose={selectDay} onCancel={close} />;
  } else if (state.status === 'loading') {
    content = <Text style={styles.secondary}>{t.nutritionLoading}</Text>;
  } else if (state.status === 'failed') {
    content = <Card title={t.nutritionLog}>
      <Text accessibilityRole="alert" style={styles.secondary}>{t.nutritionReadError}</Text>
      <Action label={t.retry} onPress={() => load(selected)} />
    </Card>;
  } else if (state.status === 'ready') {
    const { day, data } = state;
    const dateLabel = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
      month: 'short', day: 'numeric', weekday: 'short',
    }).format(dayDate(day));
    const totals = dailyTotals(data.entries);
    const goals = data.goals;
    const conflicting = new Set(state.workspace?.rows.filter((row) => row.conflict).map((row) => row.id));
    const goalsConflict = state.workspace?.rows.some((row) => row.key === goalsKey && row.conflict);

    content = <>
      <View style={nutritionStyles.dateBar}>
          <DateArrow direction="previous" label={t.nutritionPrev} disabled={syncBusy || day <= '0001-01-01'}
            onPress={() => selectDay(shiftDay(day, -1))} />
          <Pressable accessibilityRole="button" accessibilityLabel={t.nutritionDate} disabled={syncBusy}
            onPress={() => setScreen({ kind: 'date', day })}
            style={[nutritionStyles.dateChoice]}>
            <Icon name="calendar" size={17} color={colors.accent} />
            <Text style={nutritionStyles.dateLabel}>{dateLabel}</Text>
          </Pressable>
          <DateArrow direction="next" label={t.nutritionNext} disabled={syncBusy || day >= today}
            onPress={() => selectDay(shiftDay(day, 1))} />
      </View>
      {day !== today && <SecondaryButton label={t.nutritionToday} disabled={syncBusy} onPress={() => selectDay(null)} />}
      <Card title={t.nutritionTotals} tone="accent" icon="energy">
        <View>
          <Text style={styles.secondary}>{t.energy}</Text>
          <Text style={nutritionStyles.calories}>{roundAmount(totals.kcal)} <Text style={nutritionStyles.calorieUnit}>kcal</Text></Text>
          {goals && <Text style={styles.secondary}>{t.goal} {goals.values.kcal} kcal</Text>}
        </View>
        {goals && <Track value={totals.kcal} target={goals.values.kcal} />}
        <View style={nutritionStyles.macros}>
          {macroKeys.map((key) => (
            <View key={key} style={nutritionStyles.macro}>
              <Text style={[nutritionStyles.macroLabel, { color: macroColors[key] }]}>{t[key]}</Text>
              <Text style={nutritionStyles.macroValue}>{roundAmount(totals[key])} g</Text>
              {goals && (
                <>
                  <Track value={totals[key]} target={goals.values[key]} color={macroColors[key]} />
                  <Text style={nutritionStyles.macroGoal}>{t.goal} {goals.values[key]} g</Text>
                </>
              )}
            </View>
          ))}
        </View>
        <SecondaryButton label={t[data.goals ? 'nutritionEditGoals' : 'nutritionSetGoals']}
          disabled={syncBusy || Boolean(goalsConflict)}
          onPress={() => setScreen({ kind: 'goals', current: data.goals })} />
        <SecondaryButton label={t.mealTemplates} icon="history" disabled={syncBusy}
          onPress={() => setScreen({ kind: 'templates', day, meal: 'breakfast' })} />
      </Card>
      {meals.map((meal) => {
        const entries = data.entries.filter((entry) => entry.meal === meal);
        return (
        <Card key={meal} title={t[meal]} icon={meal}
          headerAction={<SecondaryButton label={t.nutritionAdd} icon="plus" disabled={syncBusy}
            onPress={() => setScreen({ kind: 'quick', day, meal })} />}>
          {entries.map((entry) => (
            <Pressable key={entry.id} accessibilityRole="button" disabled={syncBusy || conflicting.has(entry.id)}
              accessibilityLabel={`${t.nutritionEdit} · ${entry.name}`}
              style={[nutritionStyles.entry]}
              onPress={() => setScreen({ kind: 'food', day, meal, entry })}>
              <View style={nutritionStyles.entryName}>
                <Text style={styles.body}>{entry.name}</Text>
                <Text style={styles.secondary}>{entry.amount} {t[amountUnits[entry.basis]]} · {t[entry.catalogId ? 'foodLibrary' : 'nutritionManual']}</Text>
              </View>
              <Text style={nutritionStyles.entryCalories}>{roundAmount(foodTotal(entry).kcal)} kcal</Text>
              <Icon name="next" color={colors.muted} size={17} />
            </Pressable>
          ))}
          {entries.length > 0 && <SecondaryButton label={`${t.templateFromLog} · ${t[meal]}`}
            disabled={syncBusy} onPress={() => setScreen({ kind: 'templates', day, meal,
              seed: entries.map((entry) => copyMealFood(entry, meal)) })} />}
        </Card>
        );
      })}
    </>;
  }

  return (
    <Page key={screen.kind} title={t[owner ? 'nutritionAccountTitle' : 'nutrition']} icon="nutrition">
      {screen.kind === 'log' && switchLog && (
        <SecondaryButton label={t[owner ? 'nutritionDeviceLog' : 'nutritionOpenAccount']}
          disabled={syncBusy} onPress={switchLog} />
      )}
      {screen.kind === 'log' && owner && (
        <AccountNutritionSync userId={owner} workspace={state.status === 'ready' ? state.workspace : undefined}
          onBusy={setSyncBusy} onChanged={() => load(selected)} />
      )}
      {error && (
        <Card title={t.nutritionSaveStatus}>
          <Text accessibilityRole="alert" style={styles.secondary}>{t[error === 'stale' ? 'nutritionStale' : 'nutritionWriteError']}</Text>
          {error === 'stale' && <Action label={t.retry} onPress={() => { close(); load(selected); }} />}
        </Card>
      )}
      {content}
    </Page>
  );
}

function DateArrow({ direction, label, disabled, onPress }: {
  direction: 'previous' | 'next'; label: string; disabled: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress}
      style={[nutritionStyles.dateArrow, disabled && styles.disabled]}>
      <Icon name={direction} color={colors.text} size={23} />
    </Pressable>
  );
}

const nutritionStyles = StyleSheet.create({
  dateBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 3, gap: 3 },
  dateArrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dateChoice: { minHeight: 44, flex: 1, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 8 },
  dateLabel: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  calories: { color: colors.text, fontWeight: '900', fontSize: 43, letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  calorieUnit: { color: colors.muted, fontSize: 16, letterSpacing: 0, fontWeight: '700' },
  macros: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  macro: { flexBasis: 74, flexGrow: 1, backgroundColor: colors.background,
    borderRadius: 13, padding: 9, gap: 6 },
  macroLabel: { fontSize: 12, fontWeight: '700' },
  macroValue: { color: colors.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  macroGoal: { color: colors.muted, fontSize: 11 },
  entry: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 9, minHeight: 44,
    flexDirection: 'row', alignItems: 'center', gap: 7 },
  entryName: { flex: 1 },
  entryCalories: { color: colors.text, fontSize: 14, fontWeight: '700' },
});

function DateEditor({ initial, onChoose, onCancel }: {
  initial: string; onChoose: (day: string) => void; onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [date, setDate] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  function choose() {
    const value = date.trim();
    if (!isDay(value) || value > localDay() || value < '0001-01-01') {
      setInvalid(true);
      return;
    }
    Keyboard.dismiss();
    onChoose(value);
  }

  return (
    <Card title={t.nutritionDate}>
      <InputField label={t.nutritionDateInput} value={date} change={setDate}
        busy={false} maxLength={10} placeholder="YYYY-MM-DD" />
      {invalid && <Text accessibilityRole="alert" style={styles.secondary}>{t.nutritionBadDate}</Text>}
      <View style={styles.row}>
        <Action label={t.nutritionGoDate} onPress={choose} />
        <SecondaryButton label={t.profileCancel} onPress={onCancel} />
      </View>
    </Card>
  );
}

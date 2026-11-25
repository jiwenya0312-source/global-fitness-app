import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { dayDate } from './calendar';
import { useLanguage } from './language';
import {
  readMealTemplates, removeMealTemplate, resolveMealItems, saveMealTemplate, type MealTemplate,
} from './meal-templates';
import { dailyTotals, meals, roundAmount, type EarlierMeal, type Food, type FoodEntry, type Meal } from './nutrition';
import { FoodEditor, amountUnits } from './nutrition-form';
import { QuickFood } from './quick-food';
import { Action, Card, Choice, colors, InputField, SecondaryButton, styles } from './ui';

type Item = { id: number; food: Food; amount: string };
type Draft = { kind: 'edit' | 'use'; previous?: MealTemplate; meal: Meal; name: string; items: Item[] };
type Notice = 'templateSaved' | 'templateRemoved' | 'templateReadError' | 'templateWriteError' | 'templateStale'
  | 'templateInvalid' | 'templateInvalidPortions';
type Picker = { manual: boolean; replace?: number };

export function MealTemplatesPanel({ owner, initialMeal, useTargetMeal, seed, initialTemplate, copiedMeal, targetDay, busy, loadRecent, onUse, onClose }: {
  owner?: string;
  initialMeal: Meal;
  useTargetMeal?: boolean;
  seed?: Food[];
  initialTemplate?: MealTemplate;
  copiedMeal?: EarlierMeal;
  targetDay: string;
  busy: boolean;
  loadRecent: () => Promise<FoodEntry[]>;
  onUse: (foods: Food[]) => void;
  onClose: () => void;
}) {
  const { language, t } = useLanguage();
  const [templates, setTemplates] = useState<MealTemplate[]>();
  const [attempt, setAttempt] = useState(0);
  const initialFoods = copiedMeal?.foods ?? initialTemplate?.foods ?? seed;
  const [draft, setDraft] = useState<Draft | undefined>(() => initialFoods ? {
    kind: initialTemplate || copiedMeal ? 'use' : 'edit', previous: initialTemplate, meal: initialMeal, name: initialTemplate?.name ?? '',
    items: initialFoods.map((food, id) => ({ id, food, amount: String(food.amount) })),
  } : undefined);
  const [picker, setPicker] = useState<Picker>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const pending = useRef(false);
  const itemSequence = useRef(initialFoods?.length ?? 0);
  const blocked = writing || busy;

  useEffect(() => {
    let active = true;
    void readMealTemplates(owner).then((value) => {
      if (active) setTemplates(value);
    }, () => {
      if (active) setNotice('templateReadError');
    });
    return () => { active = false; };
  }, [owner, attempt]);

  function toItem(food: Food): Item {
    return { id: itemSequence.current++, food, amount: String(food.amount) };
  }

  function begin(kind: Draft['kind'], template?: MealTemplate) {
    setNotice(undefined);
    setConfirmDelete(false);
    setDraft({ kind, previous: template, meal: kind === 'use' && useTargetMeal ? initialMeal : template?.meal ?? initialMeal,
      name: template?.name ?? '', items: template?.foods.map(toItem) ?? [] });
  }

  function chooseFood(food: Food) {
    if (!draft || !picker) return;
    const item = toItem(food);
    setDraft({ ...draft, items: picker.replace === undefined ? [...draft.items, item]
      : draft.items.map((current) => current.id === picker.replace ? item : current) });
    setPicker(undefined);
    setNotice(undefined);
  }

  function openPicker(replace?: number) {
    Keyboard.dismiss();
    setPicker({ manual: false, replace });
  }

  const foods = draft ? resolveMealItems(draft.items, draft.meal) : null;
  const totals = foods ? dailyTotals(foods) : null;
  const dateFormat = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium' });

  async function write(save: () => Promise<MealTemplate[] | null>, success: 'templateSaved' | 'templateRemoved') {
    if (pending.current || busy) return;
    pending.current = true;
    setWriting(true);
    setNotice(undefined);
    try {
      const updated = await save();
      if (!updated) {
        setNotice('templateStale');
        return;
      }
      setTemplates(updated);
      setDraft(undefined);
      setConfirmDelete(false);
      setNotice(success);
    } catch {
      setNotice('templateWriteError');
    } finally {
      pending.current = false;
      setWriting(false);
    }
  }

  function submit() {
    if (!draft || blocked) return;
    const name = draft.name.trim();
    if (!foods || (draft.kind === 'edit' && !name)) {
      setNotice(draft.kind === 'use' ? 'templateInvalidPortions' : 'templateInvalid');
      return;
    }
    Keyboard.dismiss();
    if (draft.kind === 'use') onUse(foods);
    else void write(() => saveMealTemplate(owner, { name, meal: draft.meal, foods }, draft.previous), 'templateSaved');
  }

  function backToList() {
    setDraft(undefined);
    setConfirmDelete(false);
    setNotice(undefined);
    setAttempt((value) => value + 1);
  }

  if (draft && picker) {
    return picker.manual
      ? <FoodEditor meal={draft.meal} fixedMeal busy={blocked} loadRecent={loadRecent}
        onSave={chooseFood} onCancel={() => setPicker({ ...picker, manual: false })} />
      : <QuickFood initialMeal={draft.meal} owner={owner} busy={blocked} loadRecent={loadRecent}
        onSave={chooseFood} onCancel={() => setPicker(undefined)}
        onManual={() => setPicker({ ...picker, manual: true })} />;
  }

  return (
    <>
      <SecondaryButton label={t[copiedMeal ? 'profileCancel' : draft ? 'templateBackList' : 'templateClose']}
        icon="previous" disabled={blocked} onPress={draft && !copiedMeal ? backToList : onClose} />
      {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      {draft ? (
        <Card title={t[draft.kind === 'use' ? 'templatePreview' : 'templateEdit']} icon={draft.meal} tone="accent">
          {draft.kind === 'edit'
            ? <InputField label={t.templateName} value={draft.name}
              change={(name) => setDraft({ ...draft, name })} busy={blocked} maxLength={60} />
            : <>
              <Text style={styles.headline}>{copiedMeal ? t.foodRepeatMeal : draft.name}</Text>
              {copiedMeal && <Text style={styles.body}>
                {t.foodRepeatSource} · {dateFormat.format(dayDate(copiedMeal.day))} · {t[copiedMeal.meal]}
              </Text>}
              <Text style={styles.secondary}>
                {t.foodRepeatDestination} · {dateFormat.format(dayDate(targetDay))} · {t[draft.meal]}
              </Text>
              <Text style={styles.secondary}>{t.templatePreviewHint}</Text>
            </>}
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t.nutritionMeal}>
            {meals.map((meal) => (
              <Choice key={meal} label={t[meal]} selected={draft.meal === meal} disabled={blocked}
                onPress={() => setDraft({ ...draft, meal })} />
            ))}
          </View>
          {totals && <View style={templateStyles.total}>
            <Text style={styles.statValue}>{roundAmount(totals.kcal)} kcal</Text>
            <View style={styles.row}>
              {(['protein', 'carbs', 'fat'] as const).map((key) =>
                <Text key={key} style={styles.secondary}>{t[key]} {roundAmount(totals[key])} g</Text>)}
            </View>
          </View>}
          {draft.items.map((item) => (
            <View key={item.id} style={templateStyles.item}>
              <Text style={styles.body}>{item.food.name}</Text>
              <InputField label={`${t.templatePortion} (${t[amountUnits[item.food.basis]]})`}
                accessibilityLabel={`${item.food.name} · ${t[amountUnits[item.food.basis]]}`}
                value={item.amount} busy={blocked} decimal maxLength={12} change={(amount) => setDraft({
                  ...draft, items: draft.items.map((entry) => entry.id === item.id ? { ...entry, amount } : entry),
                })} />
              <View style={styles.row}>
                <SecondaryButton label={t.templateReplace} accessibilityLabel={`${t.templateReplace} · ${item.food.name}`} disabled={blocked}
                  onPress={() => openPicker(item.id)} />
                <SecondaryButton label={t.templateRemoveItem} accessibilityLabel={`${t.templateRemoveItem} · ${item.food.name}`} disabled={blocked}
                  onPress={() => setDraft({ ...draft, items: draft.items.filter((entry) => entry.id !== item.id) })} />
              </View>
            </View>
          ))}
          <SecondaryButton label={t.templateAddItem} icon="plus" disabled={blocked} onPress={() => openPicker()} />
          {confirmDelete && draft.previous && draft.kind === 'edit' ? (
            <>
              <Text style={styles.secondary}>{t.templateDeletePrompt}</Text>
              <View style={styles.row}>
                <Action label={t.templateDelete} disabled={blocked} onPress={() => {
                  const previous = draft.previous;
                  if (previous) void write(() => removeMealTemplate(owner, previous), 'templateRemoved');
                }} />
                <SecondaryButton label={t.profileCancel} disabled={blocked} onPress={() => setConfirmDelete(false)} />
              </View>
            </>
          ) : (
            <>
              <Action label={t[draft.kind === 'use' ? 'templateLogMeal' : 'templateSave']} full disabled={blocked} onPress={submit} />
              {draft.kind === 'edit' && draft.previous && <SecondaryButton label={t.templateDelete} disabled={blocked}
                onPress={() => setConfirmDelete(true)} />}
            </>
          )}
        </Card>
      ) : (
        <Card title={t.mealTemplates} icon="history" tone="accent">
          <Text style={styles.secondary}>{t.templateDeviceOnly}</Text>
          <Action label={t.templateNew} icon="plus" disabled={blocked} onPress={() => begin('edit')} />
          {!templates && notice !== 'templateReadError' && <Text style={styles.secondary}>{t.nutritionLoading}</Text>}
          {notice === 'templateReadError' && <SecondaryButton label={t.retry} onPress={() => {
            setNotice(undefined);
            setAttempt((value) => value + 1);
          }} />}
          {templates?.length === 0 && <Text style={styles.secondary}>{t.templateEmpty}</Text>}
          {templates?.map((template) => (
            <View key={template.id} style={templateStyles.item}>
              <Text style={styles.cardTitle}>{template.name}</Text>
              <Text style={styles.secondary}>{t[template.meal]} · {roundAmount(dailyTotals(template.foods).kcal)} kcal</Text>
              <Text style={styles.secondary} numberOfLines={2}>{template.foods.map((food) => food.name).join(' · ')}</Text>
              <View style={styles.row}>
                <SecondaryButton label={t.templateUse} accessibilityLabel={`${t.templateUse} · ${template.name}`} disabled={blocked}
                  onPress={() => begin('use', template)} />
                <SecondaryButton label={t.templateEdit} accessibilityLabel={`${t.templateEdit} · ${template.name}`} disabled={blocked}
                  onPress={() => begin('edit', template)} />
              </View>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const templateStyles = StyleSheet.create({
  item: { gap: 8, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12 },
  total: { padding: 12, gap: 6, backgroundColor: colors.background, borderRadius: 14 },
});

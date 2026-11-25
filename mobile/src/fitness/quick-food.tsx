import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from './pressable';

import { catalogFood, foodCatalog, type CatalogFood } from './food-catalog';
import { useLanguage } from './language';
import { readMealTemplates, type MealTemplate } from './meal-templates';
import { foodTotal, meals, roundAmount, type Food, type FoodEntry, type Meal } from './nutrition';
import { amountUnits } from './nutrition-form';
import { readPreference, writePreference } from './quick-preferences';
import { Action, Card, Choice, colors, InputField, SecondaryButton, styles } from './ui';

export function QuickFood({ initialMeal, busy, onSave, onManual, onRepeat, onTemplates, onCancel, loadRecent, owner }: {
  initialMeal: Meal; busy: boolean; onSave: (food: Food) => void; onManual: (meal: Meal) => void;
  onRepeat?: (meal: Meal) => Promise<boolean>; onTemplates?: (meal: Meal, template?: MealTemplate) => void; onCancel: () => void;
  loadRecent: () => Promise<FoodEntry[]>; owner?: string;
}) {
  const { language, t } = useLanguage();
  const [meal, setMeal] = useState(initialMeal);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const [entry, setEntry] = useState<CatalogFood>();
  const [amount, setAmount] = useState('');
  const [custom, setCustom] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [favorites, setFavorites] = useState<number[]>();
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [notice, setNotice] = useState<'foodRepeatEmpty' | 'nutritionReadError'>();
  const [copying, setCopying] = useState(false);
  const favoriteWrite = useRef(false);
  const repeatPending = useRef(false);
  const key = `fitness.food-favorites.${owner ?? 'device'}`;
  const showTemplates = Boolean(onTemplates);

  useEffect(() => {
    let active = true;
    void readPreference(key).then((raw) => {
      const ids: unknown = raw ? JSON.parse(raw) : [];
      if (active) setFavorites(Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : []);
    }).catch(() => {});
    void loadRecent().then((entries) => { if (active) setRecent(entries); }).catch(() => {});
    return () => { active = false; };
  }, [key, loadRecent]);

  useEffect(() => {
    if (!showTemplates) return;
    let active = true;
    void readMealTemplates(owner).then((value) => {
      if (active) setTemplates(value);
    }, () => {});
    return () => { active = false; };
  }, [showTemplates, owner]);

  async function toggleFavorite(id: number) {
    if (!favorites || favoriteWrite.current) return;
    favoriteWrite.current = true;
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    try {
      await writePreference(key, JSON.stringify(next));
      setFavorites(next);
    } catch {
      setNotice('nutritionReadError');
    } finally {
      favoriteWrite.current = false;
    }
  }

  async function repeat() {
    if (repeatPending.current || !onRepeat) return;
    repeatPending.current = true;
    setCopying(true);
    setNotice(undefined);
    try {
      if (!await onRepeat(meal)) setNotice('foodRepeatEmpty');
    } catch {
      setNotice('nutritionReadError');
    } finally {
      repeatPending.current = false;
      setCopying(false);
    }
  }

  const search = query.trim().normalize('NFKC').toLowerCase();
  const filtered = foodCatalog.filter((food) => (!favoriteOnly || favorites?.includes(food.id))
    && `${food.zh} ${food.en} ${food.keywords}`.toLowerCase().includes(search));
  const grams = /^\d+(?:[.,]\d{1,3})?$/.test(amount.trim()) ? Number(amount.trim().replace(',', '.')) : 0;
  const serving = entry && grams > 0 && grams <= 100000 ? catalogFood(entry, language, meal, grams) : undefined;
  const totals = serving ? foodTotal(serving) : undefined;
  const blocked = busy || copying;
  const recentFoods = recent.slice(0, 3).map((food) => (
    <SecondaryButton key={food.id} disabled={blocked}
      label={`${food.name} · ${food.amount} ${t[amountUnits[food.basis]]} · ${roundAmount(foodTotal(food).kcal)} kcal · ＋`}
      onPress={() => onSave({ meal, name: food.name, amount: food.amount, basis: food.basis,
        values: food.values, catalogId: food.catalogId })} />
  ));
  const suggestedTemplates = templates.filter((template) => template.meal === meal).concat(
    templates.filter((template) => template.meal !== meal)).slice(0, 2);

  return (
    <>
      {onRepeat ? <Card title={t.foodQuickTitle} icon={meal} tone="accent">
        <View style={styles.row}>
          {meals.map((option) => <Choice key={option} label={t[option]} selected={meal === option} disabled={blocked}
            onPress={() => { setMeal(option); setNotice(undefined); }} />)}
        </View>
        {!entry && <View style={styles.row}>
          {onTemplates && <SecondaryButton label={t.mealTemplates} icon="history"
            disabled={blocked} onPress={() => onTemplates(meal)} />}
          <SecondaryButton label={t[copying ? 'nutritionLoading' : 'foodRepeatMeal']} disabled={blocked} onPress={() => { void repeat(); }} />
        </View>}
        {!entry && !search && !favoriteOnly && <>
          {onTemplates && suggestedTemplates.map((template) => (
            <SecondaryButton key={template.id} icon="history" disabled={blocked}
              label={`${t.templateUse} · ${template.name}`} onPress={() => onTemplates(meal, template)} />
          ))}
          {recentFoods.length > 0 && <>
            <Text style={styles.secondary}>{t.foodRecent}</Text>
            {recentFoods}
          </>}
        </>}
        {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      </Card> : <Card title={t.templatePickFood} icon={meal} tone="accent">
        {notice && <Text accessibilityRole="alert" style={styles.secondary}>{t[notice]}</Text>}
      </Card>}
      {entry ? (
        <Card title={entry[language]} icon="nutrition">
          <Text style={styles.secondary}>{t.foodUseEstimate} · {entry.grams} g</Text>
          <View style={styles.row}>
            {([['foodHalf', 0.5], ['foodSingle', 1], ['foodDouble', 2]] as const).map(([label, size]) => (
              <Choice key={label} label={t[label]} selected={grams === entry.grams * size} disabled={blocked}
                onPress={() => { setCustom(false); setAmount(String(entry.grams * size)); }} />
            ))}
          </View>
          <SecondaryButton label={t.nutritionGrams} disabled={blocked} onPress={() => setCustom(!custom)} />
          {custom && <InputField label={t.nutritionGrams} value={amount} change={setAmount} busy={blocked}
            decimal maxLength={12} />}
          {totals && <View style={foodStyles.summary}>
            <Text style={foodStyles.calories}>{roundAmount(totals.kcal)} kcal</Text>
            <Text style={styles.secondary}>{grams} g</Text>
            <View style={styles.row}>
              {(['protein', 'carbs', 'fat'] as const).map((key) =>
                <Text key={key} style={styles.secondary}>{t[key]} {roundAmount(totals[key])} g</Text>)}
            </View>
          </View>}
          <Action label={t[onRepeat ? 'foodAddPortion' : 'templateAddItem']} full disabled={!serving || blocked}
            onPress={() => { if (serving) onSave(serving); }} />
          <View style={styles.row}>
            {favorites && <SecondaryButton label={t[favorites.includes(entry.id) ? 'foodFavoriteRemove' : 'foodFavoriteAdd']}
              disabled={blocked} onPress={() => { void toggleFavorite(entry.id); }} />}
            <SecondaryButton label={t.foodChooseAnother} disabled={blocked} onPress={() => setEntry(undefined)} />
          </View>
          <Text style={styles.secondary}>{t.foodSource} · {entry.id}</Text>
        </Card>
      ) : (
        <>
          {!onRepeat && recentFoods.length > 0 && !search && !favoriteOnly && <Card title={t.foodRecent} icon="history">
            {recentFoods}
          </Card>}
          <Card title={t.foodLibrary} icon="nutrition">
            <InputField label={t.foodLibrarySearch} value={query} change={(value) => {
              setLimit(8);
              setQuery(value);
            }} busy={blocked} />
            {favorites && <Choice label={t.foodFavorites} selected={favoriteOnly} disabled={blocked}
              onPress={() => { setLimit(8); setFavoriteOnly(!favoriteOnly); }} />}
            {filtered.length === 0 && <Text style={styles.secondary}>{t.nutritionNoResults}</Text>}
            {filtered.slice(0, limit).map((food) => (
              <Pressable key={food.id} accessibilityRole="button" accessibilityLabel={food[language]} disabled={blocked}
                onPress={() => { setEntry(food); setAmount(String(food.grams)); setCustom(false); }}
                style={[foodStyles.row]}>
                <Text style={[styles.body, foodStyles.name]}>{food[language]}</Text>
                <Text style={styles.secondary}>{food.values.kcal} kcal / 100 g</Text>
              </Pressable>
            ))}
            {filtered.length > limit && <SecondaryButton label={t.workoutMore} disabled={blocked}
              onPress={() => setLimit(limit + 12)} />}
          </Card>
          <SecondaryButton label={t.foodCustom} disabled={blocked} onPress={() => onManual(meal)} />
        </>
      )}
      <SecondaryButton label={t.profileCancel} disabled={blocked} onPress={onCancel} />
    </>
  );
}

const foodStyles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 9 },
  name: { flex: 1 },
  summary: { backgroundColor: colors.background, borderRadius: 14, padding: 14, gap: 4 },
  calories: { color: colors.accent, fontSize: 34, letterSpacing: -1, fontWeight: '900' },
});

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLanguage } from './language';
import {
  bases, foodTotal, meals, nutrientFields, nutrients, parseFood, parseNutrients, roundAmount,
  type Basis, type Food, type FoodEntry, type Meal, type NutrientFields, type Nutrients,
} from './nutrition';
import { readRecentFoods } from './nutrition-store';
import { Action, Card, Choice, InputField, SecondaryButton, styles } from './ui';

export const nutrientUnits = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g' } as const;
export const amountLabels = { portion: 'nutritionPortions', per100g: 'nutritionGrams', per100ml: 'nutritionMl' } as const;

export const amountUnits = { portion: 'nutritionAmountPortion', per100g: 'nutritionAmountGrams', per100ml: 'nutritionAmountMl' } as const;

type FormActions = { busy: boolean; onCancel: () => void };

function NutrientInputs({ fields, update, busy }: {
  fields: NutrientFields; update: (value: NutrientFields) => void; busy: boolean;
}) {
  const { t } = useLanguage();
  return (
    <View style={formStyles.fields}>
      {nutrients.map((key) => (
        <InputField key={key} label={`${t[key === 'kcal' ? 'energy' : key]} (${nutrientUnits[key]})`}
          value={fields[key]} change={(value) => update({ ...fields, [key]: value })}
          busy={busy} decimal maxLength={12} />
      ))}
    </View>
  );
}

export function GoalsEditor({ initial, onSave, onCancel, busy }: FormActions & {
  initial?: Nutrients;
  onSave: (value: Nutrients) => void;
}) {
  const { t } = useLanguage();
  const [fields, setFields] = useState(() => nutrientFields(initial));
  const [invalid, setInvalid] = useState(false);

  function save() {
    const values = parseNutrients(fields, false);
    setInvalid(!values);
    if (values) onSave(values);
  }

  return (
    <Card title={t.nutritionGoals}>
      <Text style={styles.secondary}>{t.nutritionGoalsHint}</Text>
      <NutrientInputs fields={fields} update={setFields} busy={busy} />
      {invalid && <Text accessibilityRole="alert" style={styles.secondary}>{t.nutritionInvalidGoals}</Text>}
      <FormButtons busy={busy} onCancel={onCancel} onSave={save} />
    </Card>
  );
}

export function FoodEditor({ meal, initial, onSave, onDelete, onCancel, busy, fixedMeal, loadRecent = readRecentFoods }: FormActions & {
  meal: Meal;
  initial?: FoodEntry;
  onSave: (food: Food) => void;
  onDelete?: () => void;
  loadRecent?: () => Promise<FoodEntry[]>;
  fixedMeal?: boolean;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial?.name ?? '');
  const [chosenMeal, setMeal] = useState(initial?.meal ?? meal);
  const [basis, setBasis] = useState<Basis>(initial?.basis ?? 'portion');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [fields, setFields] = useState(() => nutrientFields(initial?.values));
  const [invalid, setInvalid] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const food = parseFood(chosenMeal, name, basis, amount, fields);

  function copy(entry: FoodEntry) {
    setName(entry.name);
    setBasis(entry.basis);
    setAmount(String(entry.amount));
    setFields(nutrientFields(entry.values));
    setInvalid(false);
    setShowRecent(false);
  }

  return (
    <Card title={t[initial ? 'nutritionEdit' : 'nutritionAdd']}>
      {removing ? (
        <>
          <Text style={styles.body}>{initial?.name}</Text>
          <Text style={styles.secondary}>{t.nutritionDeletePrompt}</Text>
          {busy ? <Text style={styles.secondary}>{t.profileSaving}</Text> : (
            <View style={styles.row}>
              {onDelete && <Action label={t.nutritionDelete} onPress={onDelete} />}
              <SecondaryButton label={t.profileCancel} onPress={() => setRemoving(false)} />
            </View>
          )}
        </>
      ) : (
        <>
          {!initial && (
            <>
              <SecondaryButton label={t[showRecent ? 'nutritionHideRecent' : 'nutritionUseRecent']}
                disabled={busy} onPress={() => setShowRecent(!showRecent)} />
              {showRecent && <RecentFoods onChoose={copy} loadRecent={loadRecent} />}
            </>
          )}
          <InputField label={t.nutritionFoodName} value={name} change={setName} busy={busy} />
          {!fixedMeal && <>
            <Text style={styles.body}>{t.nutritionMeal}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t.nutritionMeal} style={styles.row}>
              {meals.map((option) => (
                <Choice key={option} label={t[option]} selected={option === chosenMeal} disabled={busy}
                  onPress={() => setMeal(option)} />
              ))}
            </View>
          </>}
          <Text style={styles.body}>{t.nutritionBasis}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t.nutritionBasis} style={styles.row}>
            {bases.map((option) => (
              <Choice key={option} label={t[option]} selected={option === basis} disabled={busy}
                onPress={() => setBasis(option)} />
            ))}
          </View>
          <InputField label={t[amountLabels[basis]]} value={amount} change={setAmount}
            busy={busy} decimal maxLength={12} />
          <Text style={styles.secondary}>{t.nutritionBasisHint} {t[basis]}</Text>
          <NutrientInputs fields={fields} update={setFields} busy={busy} />
          {food && <Text style={styles.secondary}>{t.nutritionEntryTotal} · {roundAmount(foodTotal(food).kcal)} kcal</Text>}
          {invalid && !food && <Text accessibilityRole="alert" style={styles.secondary}>{t.nutritionInvalidFood}</Text>}
          <FormButtons busy={busy} onCancel={onCancel} onSave={() => {
            setInvalid(!food);
            if (food) {
              const keepSource = initial?.catalogId && food.name === initial.name && food.basis === initial.basis
                && nutrients.every((key) => food.values[key] === initial.values[key]);
              onSave({ ...food, ...(keepSource ? { catalogId: initial.catalogId } : {}) });
            }
          }} />
          {initial && onDelete && !busy && (
            <SecondaryButton label={t.nutritionDelete} onPress={() => setRemoving(true)} />
          )}
        </>
      )}
    </Card>
  );
}

function RecentFoods({ onChoose, loadRecent }: {
  onChoose: (entry: FoodEntry) => void; loadRecent: () => Promise<FoodEntry[]>;
}) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<FoodEntry[]>();
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    loadRecent().then((result) => {
      if (active) setEntries(result);
    }, () => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [loadRecent]);

  const search = query.trim().normalize('NFKC').toLowerCase();
  const filtered = entries?.filter((entry) => entry.name.normalize('NFKC').toLowerCase().includes(search)).slice(0, 10);

  return (
    <View style={formStyles.fields}>
      <InputField label={t.nutritionSearch} value={query} change={setQuery} busy={false} />
      {!entries && <Text style={styles.secondary}>{t[failed ? 'nutritionReadError' : 'nutritionLoading']}</Text>}
      {filtered?.length === 0 && <Text style={styles.secondary}>{t.nutritionNoResults}</Text>}
      {filtered?.map((entry) => (
        <SecondaryButton key={entry.id} label={`${entry.name} · ${entry.values.kcal} kcal ${t[entry.basis]}`}
          onPress={() => onChoose(entry)} />
      ))}
    </View>
  );
}

function FormButtons({ busy, onSave, onCancel }: FormActions & { onSave: () => void }) {
  const { t } = useLanguage();
  return busy ? <Text accessibilityRole="alert" style={styles.secondary}>{t.profileSaving}</Text> : (
    <View style={styles.row}>
      <Action label={t.nutritionSave} onPress={onSave} />
      <SecondaryButton label={t.profileCancel} onPress={onCancel} />
    </View>
  );
}

const formStyles = StyleSheet.create({ fields: { gap: 10 } });

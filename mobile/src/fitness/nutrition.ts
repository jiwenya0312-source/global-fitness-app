import { parseDecimal } from './profile';

export const nutrients = ['kcal', 'protein', 'carbs', 'fat'] as const;
export const meals = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const bases = ['portion', 'per100g', 'per100ml'] as const;

export type Nutrient = typeof nutrients[number];
export type Nutrients = Record<Nutrient, number>;
export type NutrientFields = Record<Nutrient, string>;
export type Meal = typeof meals[number];
export type Basis = typeof bases[number];

export type Food = {
  meal: Meal;
  name: string;
  basis: Basis;
  amount: number;
  values: Nutrients;
  catalogId?: number;
};

export type FoodEntry = Food & { id: number; version: number; day: string };
export type NutritionGoals = { version: number; values: Nutrients };
export type NutritionDay = { entries: FoodEntry[]; goals: NutritionGoals | null };
export type EarlierMeal = { day: string; meal: Meal; foods: Food[] };

export function nutrientFields(values?: Nutrients): NutrientFields {
  return {
    kcal: values ? String(values.kcal) : '',
    protein: values ? String(values.protein) : '',
    carbs: values ? String(values.carbs) : '',
    fat: values ? String(values.fat) : '',
  };
}

export function parseNutritionNumber(value: string) {
  return /^\d+(?:[.,]\d{1,3})?$/.test(value.trim()) ? parseDecimal(value) : NaN;
}

export function parseNutrients(fields: NutrientFields, allowZero: boolean): Nutrients | null {
  const values = {
    kcal: parseNutritionNumber(fields.kcal), protein: parseNutritionNumber(fields.protein),
    carbs: parseNutritionNumber(fields.carbs), fat: parseNutritionNumber(fields.fat),
  };
  return nutrients.every((key) => Number.isFinite(values[key]) &&
    (allowZero ? values[key] >= 0 : values[key] > 0) && values[key] <= 100000)
    ? values : null;
}

export function parseFood(meal: Meal, nameInput: string, basis: Basis,
  quantityInput: string, fields: NutrientFields): Food | null {
  const name = nameInput.trim();
  const amount = parseNutritionNumber(quantityInput);
  const values = parseNutrients(fields, true);
  return name && amount > 0 && amount <= 100000 && values
    ? { meal, name, basis, amount, values } : null;
}

export function foodTotal(food: Food): Nutrients {
  const multiplier = food.basis === 'portion' ? food.amount : food.amount / 100;
  return {
    kcal: food.values.kcal * multiplier, protein: food.values.protein * multiplier,
    carbs: food.values.carbs * multiplier, fat: food.values.fat * multiplier,
  };
}

export function dailyTotals(entries: readonly Food[]): Nutrients {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const entry of entries) {
    const values = foodTotal(entry);
    for (const key of nutrients) totals[key] += values[key];
  }
  return totals;
}

export function roundAmount(value: number) {
  return Number(value.toFixed(2));
}

export function foodPresets(entries: FoodEntry[]) {
  const presets = new Map<string, FoodEntry>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.name.normalize('NFKC').toLowerCase(), entry.basis,
      ...nutrients.map((nutrient) => entry.values[nutrient])]);
    if (!presets.has(key)) presets.set(key, entry);
  }
  return [...presets.values()];
}

export function latestEarlierMeal(entries: FoodEntry[], day: string, meal: Meal): EarlierMeal | null {
  const index = meals.indexOf(meal);
  const prior = entries.filter((entry) => entry.day < day || (entry.day === day && meals.indexOf(entry.meal) < index));
  prior.sort((a, b) => b.day.localeCompare(a.day) || meals.indexOf(b.meal) - meals.indexOf(a.meal));
  const last = prior[0];
  if (!last) return null;
  const foods = prior.filter((entry) => entry.day === last.day && entry.meal === last.meal)
    .map(({ name, basis, amount, values, catalogId }) => ({ meal, name, basis, amount, values, catalogId }));
  return { day: last.day, meal: last.meal, foods };
}

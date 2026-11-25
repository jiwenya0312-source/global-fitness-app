import { randomUUID } from 'expo-crypto';

import { mutateAccountWorkspace } from './account-workspace';
import { readWorkspace } from './account-workspace-storage';
import { parseNutritionNumber, type Food, type Meal } from './nutrition';

export type MealTemplate = { id: string; version: number; name: string; meal: Meal; foods: Food[] };
export type MealTemplateDraft = Pick<MealTemplate, 'name' | 'meal' | 'foods'>;

const emptyTemplates = (): MealTemplate[] => [];
const scope = (owner?: string) => owner ?? 'device';

export function copyMealFood({ name, basis, amount, values, catalogId }: Food, meal: Meal): Food {
  return { meal, name, basis, amount, values, catalogId };
}

export function resolveMealItems(items: { food: Food; amount: string }[], meal: Meal): Food[] | null {
  if (!items.length) return null;
  const foods: Food[] = [];
  for (const { food, amount } of items) {
    const quantity = parseNutritionNumber(amount);
    if (!(quantity > 0 && quantity <= 100000)) return null;
    foods.push({ ...copyMealFood(food, meal), amount: quantity });
  }
  return foods;
}

export async function readMealTemplates(owner?: string) {
  return (await readWorkspace('mealTemplates', scope(owner), emptyTemplates)).workspace;
}

export async function saveMealTemplate(owner: string | undefined, draft: MealTemplateDraft, previous?: MealTemplate) {
  const next = { ...draft, id: previous?.id ?? randomUUID(), version: (previous?.version ?? 0) + 1 };
  return mutateAccountWorkspace('mealTemplates', scope(owner), emptyTemplates, (templates) => {
    if (!previous) return [next, ...templates];
    if (!templates.some(({ id, version }) => id === previous.id && version === previous.version)) return null;
    return templates.map((item) => item.id === previous.id ? next : item);
  });
}

export function removeMealTemplate(owner: string | undefined, previous: MealTemplate) {
  return mutateAccountWorkspace('mealTemplates', scope(owner), emptyTemplates, (templates) => {
    if (!templates.some(({ id, version }) => id === previous.id && version === previous.version)) return null;
    return templates.filter(({ id }) => id !== previous.id);
  });
}

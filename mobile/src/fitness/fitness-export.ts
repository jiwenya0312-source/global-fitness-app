import { exportCloudAccount } from '@/auth/cloud-privacy';

import { readAccountMeasurements } from './account-body-store';
import { readNutritionWorkspace } from './account-nutrition-store';
import { readAccountWorkouts } from './account-workout-store';
import { saveExportFile } from './data-export-file';
import { readDeviceFitnessData } from './device-export';
import type { Language } from './language';
import { readMealTemplates } from './meal-templates';
import { readPreference } from './quick-preferences';
import { readRunningData } from './running';

function saveArchive(scope: 'device' | 'account', sections: object) {
  const exportedAt = new Date().toISOString();
  const filename = `fitness-${scope}-${exportedAt.replace(/[:.]/g, '-')}.json`;
  const archive = { format: 'global-fitness-data', version: 1, scope, exportedAt, ...sections };
  return saveExportFile(filename, JSON.stringify(archive, null, 2));
}

async function readFavorites(owner: string) {
  const raw = await readPreference(`fitness.food-favorites.${owner}`);
  const value: unknown = raw ? JSON.parse(raw) : [];
  return Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id)) : [];
}

export async function exportDeviceData(language: Language) {
  const [records, favoriteFoodIds, mealTemplates, running] = await Promise.all([
    readDeviceFitnessData(), readFavorites('device'), readMealTemplates(), readRunningData(),
  ]);
  return saveArchive('device', { settings: { language, favoriteFoodIds, mealTemplates }, records: { ...records, running } });
}

export async function exportAccountData(userId: string) {
  const [cloud, body, workouts, nutrition, favoriteFoodIds, mealTemplates] = await Promise.all([
    exportCloudAccount(userId), readAccountMeasurements(userId), readAccountWorkouts(userId),
    readNutritionWorkspace(userId), readFavorites(userId), readMealTemplates(userId),
  ]);
  return saveArchive('account', {
    cloud, deviceAccountWorkspace: { measurements: body.workspace, workouts, nutrition, favoriteFoodIds, mealTemplates },
  });
}

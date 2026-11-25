export const goals = ['gainMuscle', 'loseFat', 'gainStrength', 'recomposition', 'generalFitness'] as const;
export const focuses = ['balanced', 'shoulderFocus', 'legFocus', 'coreFocus'] as const;
export type TrainingFocus = typeof focuses[number];
export const experiences = ['beginner', 'intermediate', 'advanced'] as const;
export const venues = ['homeTraining', 'gymTraining', 'mixedTraining'] as const;
export const limitations = ['noLimitations', 'hasLimitations', 'preferNotToSay'] as const;
export const units = ['metric', 'imperial'] as const;

export type BodyProfile = {
  age: number;
  heightCm: number;
  weightKg: number;
  units: typeof units[number];
  goal: typeof goals[number];
  experience: typeof experiences[number];
  days: number;
  minutes: number;
  venue: typeof venues[number];
  equipment: string;
  limitations: typeof limitations[number];
  notes: string;
  allowSuggestions: boolean;
  focus?: TrainingFocus;
  secondaryFocus?: TrainingFocus;
  preferredEquipment?: 'bodyweight' | 'dumbbells' | 'gymMachines';
};

export type ProfileRevision = {
  profile: BodyProfile;
  savedAt: string;
};

export const inchesToCm = 2.54;
export const poundsToKg = 0.45359237;

export function inRange(value: number, min: number, max: number, integer = false) {
  return value >= min && value <= max && (!integer || Number.isInteger(value));
}

export function isCompleteProfile(profile?: BodyProfile) {
  return Boolean(profile && inRange(profile.age, 1, 120, true)
    && inRange(profile.heightCm, 30, 300) && inRange(profile.weightKg, 1, 700)
    && inRange(profile.days, 1, 7, true) && inRange(profile.minutes, 1, 1440, true)
    && goals.includes(profile.goal) && experiences.includes(profile.experience)
    && venues.includes(profile.venue) && units.includes(profile.units)
    && limitations.includes(profile.limitations));
}

export function parseDecimal(input: string) {
  const normalized = input.normalize('NFKC').trim().replace(/[,。٫]/g, '.');
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

export function displayMeasurement(value: number, multiplier: number) {
  return String(Number((value / multiplier).toFixed(4)));
}

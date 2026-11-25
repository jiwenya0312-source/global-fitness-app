import { dayNumber, isDay, shiftDay } from './calendar';
import { displayMeasurement, inchesToCm, parseDecimal, poundsToKg, type BodyProfile } from './profile';

export const metrics = ['weight', 'waist'] as const;
export const periods = [30, 90, 365] as const;

export type Metric = typeof metrics[number];
export type TrendPeriod = typeof periods[number];
export type MeasurementUnits = BodyProfile['units'];
export type Measurements = { weightKg: number | null; waistCm: number | null };
export type BodyRecord = Measurements & { id: number; version: number; day: string; updatedAt: string };

const metricKeys = { weight: 'weightKg', waist: 'waistCm' } as const;
const factors = { metric: { weight: 1, waist: 1 }, imperial: { weight: poundsToKg, waist: inchesToCm } } as const;
const unitLabels = { metric: { weight: 'kg', waist: 'cm' }, imperial: { weight: 'lb', waist: 'in' } } as const;

export function measurementUnit(metric: Metric, units: MeasurementUnits) {
  return unitLabels[units][metric];
}

export function rawMeasurement(record: Measurements, metric: Metric) {
  return record[metricKeys[metric]];
}

export function measurementText(value: number, metric: Metric, units: MeasurementUnits) {
  return displayMeasurement(value, factors[units][metric]);
}

export function convertMeasurementInput(text: string, metric: Metric, from: MeasurementUnits, to: MeasurementUnits) {
  const value = parseDecimal(text);
  return Number.isFinite(value) ? measurementText(value * factors[from][metric], metric, to) : text;
}

function parseMeasurement(text: string, metric: Metric, units: MeasurementUnits, original?: Measurements) {
  if (!text.trim()) return null;
  const existing = original ? rawMeasurement(original, metric) : null;
  if (existing !== null && text.trim() === measurementText(existing, metric, units)) return existing;
  return Number((parseDecimal(text) * factors[units][metric]).toFixed(6));
}

export function readMeasurementInput(day: string, today: string, weight: string, waist: string,
  units: MeasurementUnits, original?: Measurements) {
  if (!isDay(day) || day < '0001-01-01' || day > today) return { error: 'bodyInvalidDate' } as const;
  const weightKg = parseMeasurement(weight, 'weight', units, original);
  const waistCm = parseMeasurement(waist, 'waist', units, original);
  if (weightKg === null && waistCm === null) return { error: 'bodyRequired' } as const;
  if (weightKg !== null && !(weightKg >= 1 && weightKg <= 700)) return { error: 'bodyInvalidWeight' } as const;
  if (waistCm !== null && !(waistCm >= 10 && waistCm <= 350)) return { error: 'bodyInvalidWaist' } as const;
  return { values: { weightKg, waistCm } } as const;
}

export function measurementTrend(records: BodyRecord[], metric: Metric, units: MeasurementUnits,
  today: string, period: TrendPeriod) {
  const start = shiftDay(today, 1 - period);
  const startNumber = dayNumber(start);
  const points = records.flatMap((record) => {
    const value = rawMeasurement(record, metric);
    return value === null || record.day < start || record.day > today ? [] : [{
      day: record.day,
      fraction: (dayNumber(record.day) - startNumber) / (period - 1),
      value: value / factors[units][metric],
    }];
  }).sort((first, second) => first.fraction - second.fraction);
  return { start, end: today, points };
}

import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  convertMeasurementInput, measurementText, measurementUnit, readMeasurementInput,
  type BodyRecord, type Measurements, type MeasurementUnits,
} from './body-measurements';
import { localDay } from './calendar';
import { useLanguage } from './language';
import { Action, Card, Choice, InputField, SecondaryButton, styles } from './ui';

export function BodyRecordEditor({ record, day, units, busy, onCancel, onSave, onRemove }: {
  record?: BodyRecord;
  day: string;
  units: MeasurementUnits;
  busy: boolean;
  onCancel: () => void;
  onSave: (day: string, values: Measurements) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const [date, setDate] = useState(day);
  const [system, setSystem] = useState(units);
  const [weight, setWeight] = useState(() =>
    record?.weightKg == null ? '' : measurementText(record.weightKg, 'weight', units));
  const [waist, setWaist] = useState(() =>
    record?.waistCm == null ? '' : measurementText(record.waistCm, 'waist', units));
  const [invalid, setInvalid] = useState<keyof typeof t>();
  const [removing, setRemoving] = useState(false);

  function changeUnits(next: MeasurementUnits) {
    if (next === system) return;
    setWeight(convertMeasurementInput(weight, 'weight', system, next));
    setWaist(convertMeasurementInput(waist, 'waist', system, next));
    setSystem(next);
  }

  function save() {
    const day = date.trim();
    const result = readMeasurementInput(day, localDay(), weight, waist, system, record);
    if (result.error) {
      setInvalid(result.error);
      return;
    }
    setInvalid(undefined);
    onSave(day, result.values);
  }

  return (
    <Card title={t[record ? 'bodyEdit' : 'bodyAdd']}>
      {removing ? (
        <>
          <Text style={styles.body}>{record?.day}</Text>
          <Text style={styles.secondary}>{t.bodyDeletePrompt}</Text>
          {busy ? <Text style={styles.secondary}>{t.profileSaving}</Text> : (
            <View style={styles.row}>
              <Action label={t.bodyDelete} onPress={onRemove} />
              <SecondaryButton label={t.profileCancel} onPress={() => setRemoving(false)} />
            </View>
          )}
        </>
      ) : (
        <>
          <InputField label={t.bodyDateInput} value={date} change={setDate} busy={busy} maxLength={10} />
          <Text style={styles.body}>{t.measurementUnits}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t.measurementUnits} style={styles.row}>
            {(['metric', 'imperial'] as const).map((option) => (
              <Choice key={option} label={t[option]} selected={option === system} disabled={busy}
                onPress={() => changeUnits(option)} />
            ))}
          </View>
          <InputField label={`${t.weight} (${measurementUnit('weight', system)})`} value={weight}
            change={setWeight} busy={busy} decimal maxLength={12} />
          <InputField label={`${t.waist} (${measurementUnit('waist', system)})`} value={waist}
            change={setWaist} busy={busy} decimal maxLength={12} />
          <Text style={styles.secondary}>{t.bodyFormHint}</Text>
          {invalid && <Text accessibilityRole="alert" style={styles.secondary}>{t[invalid]}</Text>}
          {busy ? <Text style={styles.secondary}>{t.profileSaving}</Text> : (
            <>
              <View style={styles.row}>
                <Action label={t.bodySave} onPress={save} />
                <SecondaryButton label={t.profileCancel} onPress={onCancel} />
              </View>
              {record && <SecondaryButton label={t.bodyDelete} onPress={() => setRemoving(true)} />}
            </>
          )}
        </>
      )}
    </Card>
  );
}

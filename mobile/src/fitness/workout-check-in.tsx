import { useState } from 'react';
import { Text, View } from 'react-native';

import { useLanguage } from './language';
import type { BodyProfile } from './profile';
import { Action, Card, Choice, SecondaryButton, styles } from './ui';
import { displaySetWeight, recommendSet, weightLabel, workingSetTarget, type TrainingMode, type WorkoutSession } from './workout-log';

export function WorkoutTargets({ session, history, profile, limit }: {
  session: WorkoutSession; history: WorkoutSession[]; profile?: BodyProfile; limit?: number;
}) {
  const { t } = useLanguage();
  const rows = session.schedule.exercises.slice(0, limit);
  return <>
    {rows.map((_, slot) => {
      const { value, reason } = recommendSet(session, slot, history, profile);
      const target = value.seconds ? `${value.seconds}s` : String(value.reps);
      const load = value.weightKg == null ? '' : ` · ${displaySetWeight(value.weightKg, session.units)} ${weightLabel(session.units)}`;
      return <View key={slot} style={{ gap: 2 }}>
        <Text style={styles.body}>{t[value.exercise]} · {workingSetTarget(session)} × {target}{load}</Text>
        <Text style={styles.secondary}>{t[reason]}</Text>
      </View>;
    })}
  </>;
}

export function WorkoutCheckIn({ duration, preview, busy, onStart, onCancel }: {
  duration: number; preview: (mode: TrainingMode, minutes?: number) => React.ReactNode;
  busy: boolean; onStart: (mode: TrainingMode, minutes?: number) => void; onCancel: () => void;
}) {
  const { language, t } = useLanguage();
  const zh = language === 'zh';
  const [state, setState] = useState<'ready' | 'light' | 'pause'>();
  const [recovery, setRecovery] = useState<'normal' | 'low'>('normal');
  const [keepWeight, setKeepWeight] = useState(false);
  const [minutes, setMinutes] = useState<number>();
  const mode = state === 'light' || recovery === 'low' ? 'lightMode' : keepWeight ? 'steadyMode' : 'progressMode';
  const durations = [30, 45, 60, 90].filter((value) => value < duration);

  return <Card title={zh ? '开练前确认' : 'Before you start'} icon="workout" tone="accent">
    <Text style={styles.body}>{zh ? '今天的精神和体力怎么样？' : 'How are your energy and focus today?'}</Text>
    <View style={styles.row}>
      <Choice label={zh ? '精神正常' : 'Normal energy'} selected={recovery === 'normal'} disabled={busy} onPress={() => setRecovery('normal')} />
      <Choice label={zh ? '精神偏低' : 'Low energy'} selected={recovery === 'low'} disabled={busy} onPress={() => setRecovery('low')} />
    </View>
    <Text style={styles.body}>{zh ? '有没有酸痛或异常疼痛？' : 'Any soreness or unusual pain?'}</Text>
    <View style={styles.row}>
      <Choice label={zh ? '状态正常' : 'Feeling normal'} selected={state === 'ready'} disabled={busy} onPress={() => setState('ready')} />
      <Choice label={zh ? '偏累或酸痛' : 'Tired or sore'} selected={state === 'light'} disabled={busy} onPress={() => setState('light')} />
      <Choice label={zh ? '异常疼痛或不确定' : 'Unusual pain or unsure'} selected={state === 'pause'} disabled={busy} onPress={() => setState('pause')} />
    </View>
    {state === 'pause' ? <Text accessibilityRole="alert" style={styles.body}>{zh
      ? '已暂停本次自动训练建议。请停止可能诱发疼痛的动作，必要时寻求专业评估。'
      : 'Training recommendations are paused. Stop movements that may trigger pain and seek professional assessment if needed.'}</Text> : state && <>
      {!!durations.length && <View style={styles.row}>
        <Choice label={zh ? '原定时长' : 'Original duration'} selected={minutes === undefined} disabled={busy} onPress={() => setMinutes(undefined)} />
        {durations.map((value) => <Choice key={value} label={`${value} ${t.planMinutes}`} selected={minutes === value} disabled={busy}
          onPress={() => setMinutes(value)} />)}
      </View>}
      {preview(mode, minutes)}
      {state === 'ready' && recovery === 'normal' && <Choice label={zh ? '保持原强度' : 'Keep my usual intensity'} selected={keepWeight}
        disabled={busy} onPress={() => setKeepWeight(!keepWeight)} />}
      <Action label={t.workoutStart} full disabled={busy} onPress={() => onStart(mode, minutes)} />
    </>}
    <SecondaryButton label={t.profileCancel} disabled={busy} onPress={onCancel} />
  </Card>;
}

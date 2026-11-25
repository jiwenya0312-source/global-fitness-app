import { SymbolView, type SymbolViewProps } from 'expo-symbols';

const names = {
  home: { ios: 'house', android: 'home', web: 'home' },
  workout: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center' },
  run: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
  nutrition: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  progress: { ios: 'chart.xyaxis.line', android: 'monitoring', web: 'monitoring' },
  profile: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  energy: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
  scale: { ios: 'scalemass', android: 'monitor_weight', web: 'monitor_weight' },
  coach: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  calendar: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  arrow: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  next: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  previous: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  recovery: { ios: 'heart', android: 'favorite', web: 'favorite' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  camera: { ios: 'camera', android: 'photo_camera', web: 'photo_camera' },
  language: { ios: 'globe', android: 'language', web: 'language' },
  cloud: { ios: 'icloud', android: 'cloud', web: 'cloud' },
  breakfast: { ios: 'sun.horizon', android: 'wb_twilight', web: 'wb_twilight' },
  lunch: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  dinner: { ios: 'moon', android: 'dark_mode', web: 'dark_mode' },
  snack: { ios: 'leaf', android: 'eco', web: 'eco' },
} satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof names;

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  return <SymbolView name={names[name]} tintColor={color} size={size} accessible={false} />;
}

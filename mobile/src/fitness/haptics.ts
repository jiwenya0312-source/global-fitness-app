import * as Haptics from 'expo-haptics';
import { AppState, Platform } from 'react-native';

export type HapticFeedback = 'selection' | 'success' | 'error' | 'timer';

function androidHaptic(feedback: HapticFeedback, sdk: number) {
  const { Segment_Tick, Keyboard_Tap, Confirm, Reject, Long_Press, Virtual_Key } = Haptics.AndroidHaptics;
  if (feedback === 'selection') return sdk >= 34 ? Segment_Tick : Keyboard_Tap;
  if (feedback === 'error') return sdk >= 30 ? Reject : Long_Press;
  return sdk >= 30 ? Confirm : Virtual_Key;
}

export function playHaptic(feedback: HapticFeedback) {
  if (AppState.currentState === 'background') return;
  if (Platform.OS === 'android') {
    void Haptics.performAndroidHapticsAsync(androidHaptic(feedback, Number(Platform.Version))).catch(() => {});
  } else if (Platform.OS === 'ios') {
    const effect = feedback === 'selection' ? Haptics.selectionAsync()
      : feedback === 'timer' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.notificationAsync(feedback === 'success'
        ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    void effect.catch(() => {});
  }
}

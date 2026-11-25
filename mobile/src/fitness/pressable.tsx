import { Pressable as NativePressable, StyleSheet, type PressableProps } from 'react-native';

import { playHaptic } from './haptics';

export function Pressable({ style, onPress, disabled, accessibilityRole, accessibilityState, ...props }: PressableProps) {
  const selected = accessibilityRole === 'radio' && accessibilityState?.checked === true;

  return <NativePressable {...props} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState}
    disabled={disabled} onPress={onPress && ((event) => {
      if (disabled) return;
      if (accessibilityRole === 'radio' && !selected) playHaptic('selection');
      onPress(event);
    })} style={(state) => [
      typeof style === 'function' ? style(state) : style,
      state.pressed && !disabled && feedbackStyles.pressed,
    ]} />;
}

const feedbackStyles = StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});

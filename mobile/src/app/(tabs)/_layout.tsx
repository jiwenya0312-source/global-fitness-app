import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/fitness/icons';
import { useLanguage } from '@/fitness/language';
import { colors } from '@/fitness/ui';

const tabs = [
  { name: 'index', label: 'home' },
  { name: 'explore', label: 'workout' },
  { name: 'nutrition', label: 'nutrition' },
  { name: 'progress', label: 'progress' },
  { name: 'profile', label: 'profile' },
] as const;

export default function FitnessTabs() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: [navigationStyles.bar, { height: 62 + insets.bottom }],
      tabBarLabelPosition: 'below-icon',
      tabBarLabelStyle: navigationStyles.label,
    }}>
      {tabs.map(({ name, label }) => (
        <Tabs.Screen key={name} name={name} options={{
          title: t[label],
          tabBarIcon: ({ focused }) => (
            <View style={[navigationStyles.icon, focused && navigationStyles.activeIcon]}>
              <Icon name={label} color={focused ? colors.accent : colors.muted} size={21} />
            </View>
          ),
        }} />
      ))}
    </Tabs>
  );
}

const navigationStyles = StyleSheet.create({
  bar: { backgroundColor: colors.background, borderTopColor: colors.border },
  label: { fontSize: 11, fontWeight: '700' },
  icon: { width: 42, height: 28, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activeIcon: { backgroundColor: colors.activeSurface },
});

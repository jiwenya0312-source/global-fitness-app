import { createContext, useCallback, useContext, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Pressable } from './pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icons';

export const colors = {
  background: '#0D100F', surface: '#191E1B', border: '#303A32',
  text: '#F5F7F1', muted: '#AAB7AD', accent: '#C8F46A',
  activeSurface: '#24321D', track: '#344034',
  accentSurface: '#1B2618', accentBorder: '#3E5631',
  warm: '#F4C682', cool: '#B0C9F5', rose: '#E8AFBF',
};

type FieldView = ComponentRef<typeof View>;
const PageScroll = createContext<(field: FieldView) => void>(() => {});

export function usePageScroll() {
  return useContext(PageScroll);
}

export function Page({ title, children, detail, icon, footer, standalone, scrollStep }: {
  title: string; children: ReactNode; detail?: string; icon?: IconName; footer?: ReactNode; standalone?: boolean;
  scrollStep?: number;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const content = useRef<FieldView>(null);
  useEffect(() => {
    if (scrollStep !== undefined) scroll.current?.scrollTo({ y: 0, animated: false });
  }, [scrollStep]);

  const scrollToField = useCallback((field: FieldView) => {
    if ('scrollIntoView' in field && typeof field.scrollIntoView === 'function') {
      field.scrollIntoView({ block: 'center' });
    } else if (content.current) {
      field.measureLayout(content.current, (_, y) => {
        scroll.current?.scrollTo({ y: Math.max(0, y), animated: false });
      });
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={standalone ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}>
      <ScrollView ref={scroll} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View ref={content} collapsable={false} style={styles.content}>
          <View style={styles.heading}>
            <View style={styles.headingText}>
              {detail && <Text style={styles.pageDetail}>{detail}</Text>}
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            </View>
            {icon && <View style={styles.pageIcon}><Icon name={icon} color={colors.accent} size={23} /></View>}
          </View>
          <PageScroll.Provider value={scrollToField}>{children}</PageScroll.Provider>
        </View>
      </ScrollView>
      {footer && <View style={styles.pageFooter}><View style={styles.footerContent}>{footer}</View></View>}
    </SafeAreaView>
  );
}

export function Card({ title, children, icon, tone, headerAction }: {
  title: string; children: ReactNode; icon?: IconName; tone?: 'accent'; headerAction?: ReactNode;
}) {
  return (
    <View style={[styles.card, tone === 'accent' && styles.accentCard]}>
      <View style={styles.cardHeading}>
        {icon && <View style={styles.iconTile}><Icon name={icon} color={colors.accent} size={18} /></View>}
        <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
        {headerAction}
      </View>
      {children}
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.secondary}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function Track({ value, target, color = colors.accent }: { value: number; target: number; color?: string }) {
  const fraction = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { backgroundColor: color, width: `${fraction * 100}%` }]} />
    </View>
  );
}

export function Action({ label, onPress, icon, full = false, disabled = false }: {
  label: string; onPress: () => void; icon?: IconName; full?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={[styles.action, full && styles.fullAction, disabled && styles.disabled]}>
      <Text style={styles.actionLabel}>{label}</Text>
      {icon && <Icon name={icon} color={colors.background} size={18} />}
    </Pressable>
  );
}

export function Choice({ label, selected, disabled, onPress }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }}
      disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.selectedChoice]}>
      <Text style={[styles.body, selected && styles.selectedChoiceLabel]}>{label}</Text>
    </Pressable>
  );
}

export function InputField({ label, accessibilityLabel = label, value, change, busy, decimal = false, maxLength = 100, placeholder }: {
  label: string;
  accessibilityLabel?: string;
  value: string;
  change: (value: string) => void;
  busy: boolean;
  decimal?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <View style={styles.inputField}>
      <Text style={styles.body}>{label}</Text>
      <TextInput accessibilityLabel={accessibilityLabel} value={value} onChangeText={change} editable={!busy}
        inputMode={decimal ? 'decimal' : 'text'} maxLength={maxLength} placeholder={placeholder}
        placeholderTextColor={colors.muted} style={styles.input} />
    </View>
  );
}

export function SecondaryButton({ label, accessibilityLabel, onPress, disabled = false, icon }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; icon?: IconName;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
      style={[styles.choice, disabled && styles.disabled]}
      disabled={disabled} onPress={onPress}>
      {icon && <Icon name={icon} color={colors.muted} size={16} />}
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  pageFooter: { borderTopColor: colors.accentBorder, borderTopWidth: 1,
    backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 8 },
  footerContent: { alignSelf: 'center', width: '100%', maxWidth: 576 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 576, alignSelf: 'center', gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 9 },
  headingText: { flex: 1, gap: 3 },
  pageDetail: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  pageIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentSurface, borderColor: colors.accentBorder, borderWidth: 1 },
  title: { color: colors.text, fontSize: 36, fontWeight: '800', letterSpacing: -0.9 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 22, padding: 16, gap: 13 },
  accentCard: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  iconTile: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.activeSurface,
    alignItems: 'center', justifyContent: 'center' },
  headline: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.45 },
  body: { color: colors.text, fontSize: 15 },
  secondary: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  stat: { flexGrow: 1, gap: 3 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  track: { height: 6, borderRadius: 10, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 10 },
  action: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 49, gap: 8, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.accent },
  fullAction: { alignSelf: 'stretch' },
  actionLabel: { color: colors.background, fontWeight: '800', fontSize: 15, flexShrink: 1 },
  choice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  selectedChoice: { backgroundColor: colors.activeSurface, borderColor: colors.accent },
  selectedChoiceLabel: { color: colors.accent },
  inputField: { gap: 5 },
  disabled: { opacity: 0.45 },
  input: { color: colors.text, backgroundColor: colors.background, minHeight: 49,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 13, paddingVertical: 9 },
});

import { type ComponentType, type Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ListTodo, Settings as SettingsIcon, type LucideProps } from 'lucide-react-native';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { colors } from '../../theme';

// Shared navigation chrome for the custom tab layout. Screen switching runs
// through Expo Router's headless <Tabs> — the mobile bar lives in the layout,
// the web sidebar links live inside each screen (which keep their own sidebar
// so Tasks can show its contexts). Tabs: Tasks · Calendar · Settings.

type IconType = ComponentType<LucideProps>;

// ---- Mobile bottom bar (rendered by the tabs layout) ----
export function MobileTabBar({ bottomInset }: { bottomInset: number }) {
  return (
    <View style={[styles.mobileBar, { paddingBottom: bottomInset }]}>
      <TabTrigger name="index" asChild>
        <BottomTabButton label="Tasks" icon={ListTodo} />
      </TabTrigger>
      <TabTrigger name="calendar" asChild>
        <BottomTabButton label="Calendar" icon={CalendarDays} />
      </TabTrigger>
      <TabTrigger name="settings" asChild>
        <BottomTabButton label="Settings" icon={SettingsIcon} />
      </TabTrigger>
    </View>
  );
}

// ---- Web sidebar nav links (rendered inside each screen's sidebar) ----
export function SideNavLinks() {
  return (
    <>
      <TabTrigger name="index" asChild>
        <SideNavButton label="Tasks" icon={ListTodo} />
      </TabTrigger>
      <TabTrigger name="calendar" asChild>
        <SideNavButton label="Calendar" icon={CalendarDays} />
      </TabTrigger>
      <TabTrigger name="settings" asChild>
        <SideNavButton label="Settings" icon={SettingsIcon} />
      </TabTrigger>
    </>
  );
}

// Both buttons accept TabTriggerSlotProps (asChild forwards isFocused/onPress/ref).
type NavButtonProps = Partial<TabTriggerSlotProps> & {
  label: string;
  icon: IconType;
  ref?: Ref<View>;
};

function BottomTabButton({ label, icon: Icon, isFocused, ref, ...rest }: NavButtonProps) {
  const color = isFocused ? colors.accentPrimary : colors.textMuted;
  return (
    <Pressable ref={ref} {...rest} style={styles.bottomTab}>
      <Icon size={20} color={color} />
      <Text style={[styles.bottomTabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function SideNavButton({ label, icon: Icon, isFocused, ref, ...rest }: NavButtonProps) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={[styles.sideNav, isFocused && { backgroundColor: colors.bgCard }]}
    >
      <Icon size={16} color={isFocused ? colors.accentPrimary : colors.textMuted} />
      <Text style={[styles.sideNavLabel, { color: isFocused ? colors.textPrimary : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mobileBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.bgCard,
    backgroundColor: colors.bgSurface,
  },
  bottomTab: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 6, gap: 3 },
  bottomTabLabel: { fontSize: 10 },
  sideNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  sideNavLabel: { fontSize: 13.5, fontWeight: '500' },
});

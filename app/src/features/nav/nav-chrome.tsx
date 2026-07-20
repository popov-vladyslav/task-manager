import { type ComponentType, type Ref } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarDays, ListTodo, RotateCcw, Settings as SettingsIcon, type LucideProps } from 'lucide-react-native';
import { TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useRouter } from 'expo-router';
import { colors } from '../../theme';

// Shared navigation chrome for the custom tab layout. Screen switching runs
// through Expo Router's headless <Tabs> — the mobile bar lives in the layout,
// the web sidebar links live inside each screen (which keep their own sidebar
// so Tasks can show its contexts). Calendar is a later phase: it has no route
// yet, so it's a plain button that flashes `onUnavailable`.

type IconType = ComponentType<LucideProps>;

// ---- Mobile bottom bar (rendered by the tabs layout) ----
export function MobileTabBar({ bottomInset }: { bottomInset: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.bgCard,
        paddingBottom: bottomInset,
        backgroundColor: colors.bgSurface,
      }}
    >
      <TabTrigger name="index" asChild>
        <BottomTabButton label="Tasks" icon={ListTodo} />
      </TabTrigger>
      <TabTrigger name="routines" asChild>
        <BottomTabButton label="Routine" icon={RotateCcw} />
      </TabTrigger>
      <TabTrigger name="calendar" asChild>
        <BottomTabButton label="Calendar" icon={CalendarDays} />
      </TabTrigger>
    </View>
  );
}

// ---- Web sidebar nav links (rendered inside each screen's sidebar) ----
export function SideNavLinks() {
  const router = useRouter();
  return (
    <>
      <TabTrigger name="index" asChild>
        <SideNavButton label="Tasks" icon={ListTodo} />
      </TabTrigger>
      <TabTrigger name="routines" asChild>
        <SideNavButton label="Routine" icon={RotateCcw} />
      </TabTrigger>
      <TabTrigger name="calendar" asChild>
        <SideNavButton label="Calendar" icon={CalendarDays} />
      </TabTrigger>
      {/* Settings is a stacked route, not a tab — plain nav button. */}
      <SideNavButton label="Settings" icon={SettingsIcon} onPress={() => router.push('/settings')} />
    </>
  );
}

// ---- Mobile header gear (rendered in each screen's top-right) ----
export function SettingsGearButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={{ padding: 6 }}>
      <SettingsIcon size={20} color={colors.textMuted} />
    </Pressable>
  );
}

// Both buttons accept TabTriggerSlotProps (asChild forwards isFocused/onPress/ref)
// and also work standalone for the Calendar placeholder.
type NavButtonProps = Partial<TabTriggerSlotProps> & {
  label: string;
  icon: IconType;
  ref?: Ref<View>;
};

function BottomTabButton({ label, icon: Icon, isFocused, ref, ...rest }: NavButtonProps) {
  const color = isFocused ? colors.accentPrimary : colors.textMuted;
  return (
    <Pressable ref={ref} {...rest} style={{ flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 6, gap: 3 }}>
      <Icon size={20} color={color} />
      <Text style={{ fontSize: 10, color }}>{label}</Text>
    </Pressable>
  );
}

function SideNavButton({ label, icon: Icon, isFocused, ref, ...rest }: NavButtonProps) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 4,
        backgroundColor: isFocused ? colors.bgCard : 'transparent',
      }}
    >
      <Icon size={16} color={isFocused ? colors.accentPrimary : colors.textMuted} />
      <Text style={{ fontSize: 13.5, fontWeight: '500', color: isFocused ? colors.textPrimary : colors.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

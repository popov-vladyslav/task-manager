import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { CalendarDeadline, CalendarEntry } from '@task-manager/shared';
import { colors, monoFont } from '../../theme';
import { useCalendarStore } from '../../store/calendar';
import { useTasksStore } from '../../store/tasks';
import { SideNavLinks } from '../nav/nav-chrome';
import { useAuthStore } from '../../store/auth';
import { HOUR_END, HOUR_START, sameDay, visibleDays, type CalMode } from './calendar-dates';

const WIDE_BREAKPOINT = 768;
const HOUR_H = 48;
const LABEL_W = 44;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const GRID_H = HOURS.length * HOUR_H;

const MODES: { k: CalMode; label: string }[] = [
  { k: 'day', label: 'Day' },
  { k: '3day', label: '3 days' },
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
];

const timeToY = (d: Date) => {
  const h = d.getHours() + d.getMinutes() / 60;
  return (Math.max(HOUR_START, Math.min(HOUR_END, h)) - HOUR_START) * HOUR_H;
};

export function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const { mode, anchor, data, load, setMode, shift, goToDay, goToToday } = useCalendarStore();
  const contexts = useTasksStore((s) => s.contexts);

  useEffect(() => {
    load();
    if (useTasksStore.getState().contexts.length === 0) useTasksStore.getState().load();
  }, [load]);

  const colorOf = (id: number | null) =>
    (id != null && contexts.find((c) => c.id === id)?.color) || colors.textMuted;

  const title = useMemo(() => {
    if (mode === 'month') return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const days = visibleDays(mode, anchor);
    const first = days[0];
    const last = days[days.length - 1];
    if (mode === 'day') return first.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(first)} – ${fmt(last)}`;
  }, [mode, anchor]);

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 20, fontWeight: '600', letterSpacing: -0.3, color: colors.textPrimary }}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <NavBtn onPress={() => shift(-1)}><ChevronLeft size={16} color={colors.textSecondary} /></NavBtn>
          <Pressable onPress={goToToday} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.bgElevated }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary }}>Today</Text>
          </Pressable>
          <NavBtn onPress={() => shift(1)}><ChevronRight size={16} color={colors.textSecondary} /></NavBtn>
        </View>
      </View>
      {/* mode switcher */}
      <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.bgCard, alignSelf: 'flex-start' }}>
        {MODES.map((m) => {
          const active = mode === m.k;
          return (
            <Pressable
              key={m.k}
              onPress={() => setMode(m.k)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? colors.bgElevated : 'transparent' }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: active ? '600' : '500', color: active ? colors.textPrimary : colors.textMuted }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const body =
    mode === 'month' ? (
      <MonthView
        anchor={anchor}
        deadlines={data?.deadlines ?? []}
        colorOf={colorOf}
        onPickDay={goToDay}
      />
    ) : (
      <Timeline
        mode={mode}
        anchor={anchor}
        entries={data?.entries ?? []}
        deadlines={data?.deadlines ?? []}
        colorOf={colorOf}
      />
    );

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bgBase }}>
        <View style={{ width: 240, paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#10141B', borderRightWidth: 1, borderRightColor: colors.bgCard }}>
          <View style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
            <Text style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: 2, color: colors.textMuted }}>LOG</Text>
          </View>
          <SideNavLinks />
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => useAuthStore.getState().signOut()} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Sign out</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingTop: insets.top + 24, paddingHorizontal: 24 }}>
          {header}
          <View style={{ flex: 1 }}>{body}</View>
        </View>
      </View>
    );
  }

  // ---- MOBILE ----
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 16, flex: 1 }}>
        {header}
        <View style={{ flex: 1 }}>{body}</View>
      </View>
    </View>
  );
}

function NavBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ padding: 7, borderRadius: 8, backgroundColor: colors.bgElevated }}>
      {children}
    </Pressable>
  );
}

// ---- Timeline (day / 3-day / week) ----
function Timeline({
  mode,
  anchor,
  entries,
  deadlines,
  colorOf,
}: {
  mode: CalMode;
  anchor: Date;
  entries: CalendarEntry[];
  deadlines: CalendarDeadline[];
  colorOf: (id: number | null) => string;
}) {
  const days = visibleDays(mode, anchor);
  const now = new Date();
  const scrollRef = useRef<ScrollView>(null);

  // Start scrolled near the current hour instead of at midnight.
  useEffect(() => {
    const y = Math.max(0, (now.getHours() - 1) * HOUR_H);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* day headers + all-day deadlines */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.bgCard, paddingBottom: 6 }}>
        <View style={{ width: LABEL_W }} />
        {days.map((d) => {
          const isToday = sameDay(d, now);
          const dayDeadlines = deadlines.filter((dl) => sameDay(new Date(dl.dueAt), d));
          return (
            <View key={d.toISOString()} style={{ flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 2 }}>
              <Text style={{ fontFamily: monoFont, fontSize: 9.5, letterSpacing: 0.5, color: colors.textMuted }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </Text>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? colors.accentPrimary : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isToday ? colors.bgBase : colors.textPrimary }}>{d.getDate()}</Text>
              </View>
              {dayDeadlines.slice(0, 2).map((dl) => (
                <View key={dl.id} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: `${colorOf(dl.contextId)}22` }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colorOf(dl.contextId) }} />
                  <Text numberOfLines={1} style={{ fontSize: 8.5, color: colors.textSecondary }}>{dl.title}</Text>
                </View>
              ))}
              {dayDeadlines.length > 2 ? (
                <Text style={{ fontSize: 8, color: colors.textMuted }}>+{dayDeadlines.length - 2}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* scrollable hour grid (absolute-fill so the ScrollView bounds + scrolls on web) */}
      <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView ref={scrollRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', height: GRID_H }}>
          {/* hour labels */}
          <View style={{ width: LABEL_W }}>
            {HOURS.map((h) => (
              <View key={h} style={{ height: HOUR_H }}>
                <Text style={{ position: 'absolute', top: -6, right: 6, fontFamily: monoFont, fontSize: 9, color: colors.textFaint }}>{h}:00</Text>
              </View>
            ))}
          </View>
          {/* day columns */}
          {days.map((d) => {
            const isToday = sameDay(d, now);
            const dayEntries = entries.filter((e) => sameDay(new Date(e.startedAt), d));
            return (
              <View key={d.toISOString()} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.bgCard }}>
                {HOURS.map((h) => (
                  <View key={h} style={{ height: HOUR_H, borderTopWidth: 1, borderTopColor: '#151A22' }} />
                ))}
                {dayEntries.map((e) => {
                  const start = new Date(e.startedAt);
                  const end = e.endedAt ? new Date(e.endedAt) : now;
                  const top = timeToY(start);
                  const height = Math.max(timeToY(end) - top, 15);
                  const c = colorOf(e.contextId);
                  return (
                    <View
                      key={e.id}
                      style={{ position: 'absolute', left: 2, right: 2, top, height, borderRadius: 5, paddingHorizontal: 5, paddingTop: 2, overflow: 'hidden', backgroundColor: `${c}26`, borderLeftWidth: 2.5, borderLeftColor: c }}
                    >
                      <Text numberOfLines={2} style={{ fontSize: 10, color: colors.textPrimary }}>{e.taskTitle}</Text>
                    </View>
                  );
                })}
                {isToday && now.getHours() >= HOUR_START && now.getHours() < HOUR_END ? (
                  <View style={{ position: 'absolute', left: 0, right: 0, top: timeToY(now), flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentNow, marginLeft: -3 }} />
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.accentNow }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

// ---- Month (dot grid) ----
function MonthView({
  anchor,
  deadlines,
  colorOf,
  onPickDay,
}: {
  anchor: Date;
  deadlines: CalendarDeadline[];
  colorOf: (id: number | null) => string;
  onPickDay: (d: Date) => void;
}) {
  const days = visibleDays('month', anchor);
  const now = new Date();
  const month = anchor.getMonth();
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingBottom: 8 }}>
        {weekdays.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontFamily: monoFont, fontSize: 9.5, letterSpacing: 0.5, color: colors.textMuted }}>
            {w.toUpperCase()}
          </Text>
        ))}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((d) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, now);
          const dayDeadlines = deadlines.filter((dl) => sameDay(new Date(dl.dueAt), d));
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => onPickDay(d)}
              style={{ width: `${100 / 7}%`, height: `${100 / 6}%`, padding: 4, borderWidth: 0.5, borderColor: colors.bgCard }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? colors.accentPrimary : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '500', color: isToday ? colors.bgBase : inMonth ? colors.textPrimary : colors.textFaint }}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
                {dayDeadlines.slice(0, 4).map((dl) => (
                  <View key={dl.id} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colorOf(dl.contextId) }} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

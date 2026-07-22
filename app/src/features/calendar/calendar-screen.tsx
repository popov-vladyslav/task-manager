import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { CalendarBlock, Task } from '@task-manager/shared';
import { colors, monoFont } from '../../theme';
import { haptics } from '../../lib/haptics';
import { useCalendarStore } from '../../store/calendar';
import { useTasksStore } from '../../store/tasks';
import { SideNavLinks } from '../nav/nav-chrome';
import { useAuthStore } from '../../store/auth';
import { api } from '../../lib/api';
import { TaskDetail } from '../tasks/task-detail';
import { HOUR_END, HOUR_H, HOUR_START, SNAP_MIN, combineDayTime, sameDay, snapMinutes, visibleDays, yToMinutes, type CalMode } from './calendar-dates';
import { DragPreview, overlayHeightForMin } from './calendar-overlay';
import { resolveDrop } from './use-calendar-gestures';
import { layoutDayBlocks } from './calendar-layout';
import { NewTaskSheet } from '../tasks/new-task-sheet';

const WIDE_BREAKPOINT = 768;
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

// A light selection tick when a block is grabbed / a slot is long-pressed to
// create. Real-hardware gating lives in the shared helper.
const grabTick = () => haptics.select();

export function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const { mode, anchor, data, load, hydrateMode, setMode, shift, goToDay, goToToday } = useCalendarStore();
  const contexts = useTasksStore((s) => s.contexts);

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const openBlock = async (taskId: string) => {
    try {
      setDetailTask(await api.getTask(taskId));
    } catch {
      /* ignore — task may have been deleted */
    }
  };

  useEffect(() => {
    hydrateMode(); // restore last-selected mode (defaults to Day), then load
    if (useTasksStore.getState().contexts.length === 0) useTasksStore.getState().load();
  }, [hydrateMode]);

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
        blocks={data?.blocks ?? []}
        colorOf={colorOf}
        onPickDay={goToDay}
      />
    ) : (
      <Timeline
        mode={mode}
        anchor={anchor}
        blocks={data?.blocks ?? []}
        colorOf={colorOf}
        onOpenBlock={openBlock}
      />
    );

  const detailModal = detailTask ? (
    <TaskDetail
      task={detailTask}
      contexts={contexts}
      onClose={() => setDetailTask(null)}
      onPatch={async (id, patch) => {
        await useTasksStore.getState().patchTask(id, patch);
        const fresh = await api.getTask(id).catch(() => null);
        if (fresh) setDetailTask(fresh);
        load();
      }}
      onDelete={async (id) => {
        await useTasksStore.getState().removeTask(id);
        setDetailTask(null);
        load();
      }}
    />
  ) : null;

  // ---- WEB / WIDE: sidebar + main ----
  if (wide) {
    return (
      <>
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
        {detailModal}
      </>
    );
  }

  // ---- MOBILE ----
  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }}>
        <View style={{ paddingHorizontal: 16, flex: 1 }}>
          {header}
          <View style={{ flex: 1 }}>{body}</View>
        </View>
      </View>
      {detailModal}
    </>
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
  blocks,
  colorOf,
  onOpenBlock,
}: {
  mode: CalMode;
  anchor: Date;
  blocks: CalendarBlock[];
  colorOf: (id: number | null) => string;
  onOpenBlock: (id: string) => void;
}) {
  const days = visibleDays(mode, anchor);
  const now = new Date();
  const scrollRef = useRef<ScrollView>(null);

  const moveBlock = useCalendarStore((s) => s.moveBlock);
  const createAt = useCalendarStore((s) => s.createAt);
  const [gridW, setGridW] = useState(0);
  const [drag, setDrag] = useState<null | { id: string; durMin: number; left: number; top: number; color: string; title: string }>(null);
  const [draft, setDraft] = useState<null | { startISO: string; left: number; top: number; day: Date }>(null);
  const colW = gridW > 0 ? (gridW - LABEL_W) / days.length : 0;

  // Start scrolled near the current hour instead of at midnight.
  useEffect(() => {
    const y = Math.max(0, (now.getHours() - 1) * HOUR_H);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colLeft = (dayIndex: number) => LABEL_W + dayIndex * colW;

  const computeDrop = (ex: number, ey: number, b: CalendarBlock, durMin: number) => {
    const startDay = new Date(b.startAt);
    const curCol = Math.max(0, days.findIndex((d) => sameDay(d, startDay)));
    const gridX = colLeft(curCol) + 2 + ex;
    const gridY = timeToY(new Date(b.startAt)) + ey;
    return resolveDrop(days, gridX, gridY, LABEL_W, colW, durMin);
  };

  const updateDrag = (ex: number, ey: number, b: CalendarBlock, durMin: number, color: string) => {
    const drop = computeDrop(ex, ey, b, durMin);
    setDrag({ id: b.id, durMin, left: colLeft(drop.dayIndex) + 2, top: (drop.minutes / 60) * HOUR_H, color, title: b.title });
  };

  const commitDrag = (ex: number, ey: number, b: CalendarBlock, durMin: number) => {
    const drop = computeDrop(ex, ey, b, durMin);
    setDrag(null);
    if (drop.startISO !== b.startAt) moveBlock(b.id, drop.startISO);
  };

  const DEFAULT_DUR = 30;
  const openDraft = (day: Date, y: number) => {
    const minutes = snapMinutes(yToMinutes(y, HOUR_H), SNAP_MIN, DEFAULT_DUR);
    const startISO = combineDayTime(day, minutes).toISOString();
    const col = days.findIndex((dd) => sameDay(dd, day));
    setDraft({ startISO, left: LABEL_W + Math.max(0, col) * colW + 2, top: (minutes / 60) * HOUR_H, day });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* day headers */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.bgCard, paddingBottom: 6 }}>
        <View style={{ width: LABEL_W }} />
        {days.map((d) => {
          const isToday = sameDay(d, now);
          return (
            <View key={d.toISOString()} style={{ flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 2 }}>
              <Text style={{ fontFamily: monoFont, fontSize: 9.5, letterSpacing: 0.5, color: colors.textMuted }}>
                {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </Text>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? colors.accentPrimary : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isToday ? colors.bgBase : colors.textPrimary }}>{d.getDate()}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* scrollable hour grid (absolute-fill so the ScrollView bounds + scrolls on web) */}
      <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView ref={scrollRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', height: GRID_H }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
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
            const dayBlocks = blocks.filter((b) => sameDay(new Date(b.startAt), d));
            // runOnJS(true): handlers run on the JS thread (they only call setState/
            // store actions), so nothing — notably the `Date` `d` — is serialized to a
            // worklet. Serializing a Date crashes on native ("Cannot copy value of type Date").
            const bgTap = Gesture.Tap().runOnJS(true).onEnd((e) => openDraft(d, e.y));
            const bgLong = Gesture.LongPress()
              .minDuration(300)
              .runOnJS(true)
              .onStart((e) => {
                grabTick();
                openDraft(d, e.y);
              });
            const bgGesture = Platform.OS === 'web' ? bgTap : bgLong;
            const dayLayout = layoutDayBlocks(dayBlocks);
            return (
              <View key={d.toISOString()} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.bgCard }}>
                <GestureDetector gesture={bgGesture}>
                  <View>
                    {HOURS.map((h) => (
                      <View key={h} style={{ height: HOUR_H, borderTopWidth: 1, borderTopColor: '#151A22' }} />
                    ))}
                  </View>
                </GestureDetector>
                {dayBlocks.map((b) => {
                  const start = new Date(b.startAt);
                  const end = new Date(b.endAt);
                  const top = timeToY(start);
                  const height = Math.max(timeToY(end) - top, 15);
                  const c = colorOf(b.contextId);
                  const durMin = (end.getTime() - start.getTime()) / 60000;
                  // Overlapping blocks split the column into side-by-side lanes.
                  const lay = dayLayout.get(b.id);
                  const cols = lay?.cols ?? 1;
                  const usable = colW > 0 ? colW - 4 : 0;
                  const laneStyle =
                    cols > 1 && usable > 0
                      ? { left: 2 + (lay!.col * usable) / cols, width: usable / cols - 1 }
                      : { left: 2, right: 2 };
                  const panBase = Gesture.Pan()
                    .runOnJS(true)
                    .onStart(() => grabTick())
                    .onUpdate((e) => updateDrag(e.x, e.y, b, durMin, c))
                    .onEnd((e) => commitDrag(e.x, e.y, b, durMin));
                  const pan =
                    Platform.OS === 'web'
                      ? panBase.activeOffsetX([-4, 4]).activeOffsetY([-4, 4])
                      : panBase.activateAfterLongPress(220);
                  const tap = Gesture.Tap().runOnJS(true).onEnd(() => onOpenBlock(b.id));
                  const gesture = Gesture.Exclusive(pan, tap);
                  return (
                    <GestureDetector key={b.id} gesture={gesture}>
                      <Animated.View
                        style={{
                          position: 'absolute',
                          ...laneStyle,
                          top,
                          height,
                          borderRadius: 5,
                          paddingHorizontal: 5,
                          paddingTop: 2,
                          overflow: 'hidden',
                          backgroundColor: b.done ? `${c}12` : `${c}26`,
                          borderLeftWidth: 2.5,
                          borderLeftColor: c,
                          opacity: drag?.id === b.id ? 0.35 : b.done ? 0.6 : 1,
                        }}
                      >
                        <Text
                          numberOfLines={2}
                          style={{
                            fontSize: 10,
                            color: b.done ? colors.textMuted : colors.textPrimary,
                            textDecorationLine: b.done ? 'line-through' : 'none',
                          }}
                        >
                          {b.title}
                        </Text>
                      </Animated.View>
                    </GestureDetector>
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
          {drag ? (
            <DragPreview left={drag.left} top={drag.top} width={colW - 4} height={overlayHeightForMin(drag.durMin)} color={drag.color} title={drag.title} />
          ) : null}
          {draft ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: draft.left, top: draft.top, width: colW - 4, height: overlayHeightForMin(30), borderRadius: 5, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentPrimary, backgroundColor: `${colors.accentPrimary}18` }} />
          ) : null}
        </View>
      </ScrollView>
      </View>
      {draft ? (
        <NewTaskSheet
          startISO={draft.startISO}
          durationMin={30}
          onCreate={createAt}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </View>
  );
}

// ---- Month (mini event bars per day) ----
function MonthView({
  anchor,
  blocks,
  colorOf,
  onPickDay,
}: {
  anchor: Date;
  blocks: CalendarBlock[];
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
          const dayBlocks = blocks
            .filter((b) => sameDay(new Date(b.startAt), d))
            .sort((a, b) => a.startAt.localeCompare(b.startAt));
          const MAX_BARS = 3;
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
              <View style={{ marginTop: 3, gap: 1.5 }}>
                {dayBlocks.slice(0, MAX_BARS).map((b) => {
                  const c = colorOf(b.contextId);
                  return (
                    <View
                      key={b.id}
                      style={{
                        borderRadius: 2,
                        paddingHorizontal: 3,
                        paddingVertical: 0.5,
                        backgroundColor: `${c}2E`,
                        borderLeftWidth: 2,
                        borderLeftColor: c,
                        opacity: b.done ? 0.5 : 1,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 8,
                          lineHeight: 11,
                          color: b.done ? colors.textMuted : colors.textSecondary,
                          textDecorationLine: b.done ? 'line-through' : 'none',
                        }}
                      >
                        {b.title}
                      </Text>
                    </View>
                  );
                })}
                {dayBlocks.length > MAX_BARS ? (
                  <Text style={{ fontSize: 7.5, color: colors.textMuted, paddingLeft: 3 }}>
                    +{dayBlocks.length - MAX_BARS}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

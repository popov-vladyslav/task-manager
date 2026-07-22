import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { DEFAULT_DURATION_MIN, type CalendarBlock, type Task } from '@task-manager/shared';
import { colors, monoFont, WIDE_BREAKPOINT } from '../../theme';
import { haptics } from '../../lib/haptics';
import { useCalendarStore } from '../../store/calendar';
import { useTasksStore } from '../../store/tasks';
import { SideNavLinks } from '../nav/nav-chrome';
import { useAuthStore } from '../../store/auth';
import { api } from '../../lib/api';
import { TaskDetail } from '../tasks/task-detail';
import {
  HOUR_END,
  HOUR_H,
  HOUR_H_MAX,
  HOUR_H_MIN,
  HOUR_START,
  SNAP_MIN,
  combineDayTime,
  sameDay,
  snapMinutes,
  visibleDays,
  yToMinutes,
  type CalMode,
} from './calendar-dates';
import { DragPreview, overlayHeightForMin } from './calendar-overlay';
import { resolveDrop } from './use-calendar-gestures';
import { layoutDayBlocks } from './calendar-layout';
import { NewTaskSheet } from '../tasks/new-task-sheet';

const LABEL_W = 44;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

const MODES: { k: CalMode; label: string }[] = [
  { k: 'day', label: 'Day' },
  { k: '3day', label: '3 days' },
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
];

// A light selection tick when a block is grabbed / a slot is long-pressed to
// create. Real-hardware gating lives in the shared helper.
const grabTick = () => haptics.select();

export function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const { mode, anchor, data, load, hydrateMode, setMode, shift, goToDay, goToToday } =
    useCalendarStore();
  const contexts = useTasksStore((s) => s.contexts);

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  // Stable so the timeline's per-block tap gesture can be memoized against it.
  const openBlock = useCallback(async (taskId: string) => {
    try {
      setDetailTask(await api.getTask(taskId));
    } catch {
      /* ignore — task may have been deleted */
    }
  }, []);

  useEffect(() => {
    hydrateMode(); // restore last-selected mode (defaults to Day), then load
    if (useTasksStore.getState().contexts.length === 0) useTasksStore.getState().load();
  }, [hydrateMode]);

  const colorOf = (id: number | null) =>
    (id != null && contexts.find((c) => c.id === id)?.color) || colors.textMuted;

  const title = useMemo(() => {
    if (mode === 'month')
      return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const days = visibleDays(mode, anchor);
    const first = days[0];
    const last = days[days.length - 1];
    if (mode === 'day')
      return first.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(first)} – ${fmt(last)}`;
  }, [mode, anchor]);

  const header = (
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerNav}>
          <NavBtn onPress={() => shift(-1)}>
            <ChevronLeft size={16} color={colors.textSecondary} />
          </NavBtn>
          <Pressable onPress={goToToday} style={styles.todayBtn}>
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
          <NavBtn onPress={() => shift(1)}>
            <ChevronRight size={16} color={colors.textSecondary} />
          </NavBtn>
        </View>
      </View>
      <View style={styles.modeBar}>
        {MODES.map((m) => {
          const active = mode === m.k;
          return (
            <Pressable
              key={m.k}
              onPress={() => setMode(m.k)}
              style={[
                styles.modeBtn,
                // eslint-disable-next-line react-native/no-inline-styles
                { backgroundColor: active ? colors.bgElevated : 'transparent' },
              ]}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  // eslint-disable-next-line react-native/no-inline-styles
                  {
                    fontWeight: active ? '600' : '500',
                    color: active ? colors.textPrimary : colors.textMuted,
                  },
                ]}
              >
                {m.label}
              </Text>
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
        <View style={styles.wideRoot}>
          <View style={[styles.sidebar, { paddingTop: insets.top + 16 }]}>
            <View style={styles.sidebarLogo}>
              <Text style={styles.sidebarLogoText}>LOG</Text>
            </View>
            <SideNavLinks />
            <View style={styles.flex1} />
            <Pressable onPress={() => useAuthStore.getState().signOut()} style={styles.signOutBtn}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
          <View style={[styles.wideMain, { paddingTop: insets.top + 24 }]}>
            {header}
            <View style={styles.flex1}>{body}</View>
          </View>
        </View>
        {detailModal}
      </>
    );
  }

  // ---- MOBILE ----
  return (
    <>
      <View style={[styles.mobileRoot, { paddingTop: insets.top + 8 }]}>
        <View style={styles.mobileInner}>
          {header}
          <View style={styles.flex1}>{body}</View>
        </View>
      </View>
      {detailModal}
    </>
  );
}

function NavBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.navBtn}>
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
  const days = useMemo(() => visibleDays(mode, anchor), [mode, anchor]);
  const now = new Date();
  const scrollRef = useRef<ScrollView>(null);

  const moveBlock = useCalendarStore((s) => s.moveBlock);
  const createAt = useCalendarStore((s) => s.createAt);
  const [gridW, setGridW] = useState(0);
  const [drag, setDrag] = useState<null | {
    id: string;
    durMin: number;
    left: number;
    top: number;
    color: string;
    title: string;
  }>(null);
  const [draft, setDraft] = useState<null | {
    startISO: string;
    left: number;
    top: number;
    day: Date;
  }>(null);
  const colW = gridW > 0 ? (gridW - LABEL_W) / days.length : 0;

  // Pinch-to-zoom the timeline: hour height is state, scaled by a two-finger
  // pinch and clamped. Block/now-line positions and drag math all derive from it,
  // so short (e.g. 15-min) tasks become legible and easy to grab.
  const [hourH, setHourH] = useState(HOUR_H);
  const hourHRef = useRef(hourH);
  hourHRef.current = hourH;
  const scrollY = useRef(0);
  const pinchBaseH = useRef(HOUR_H);
  const pinchBaseScroll = useRef(0);
  const gridH = HOURS.length * hourH;
  const timeToY = useCallback(
    (d: Date) => {
      const h = d.getHours() + d.getMinutes() / 60;
      return (Math.max(HOUR_START, Math.min(HOUR_END, h)) - HOUR_START) * hourH;
    },
    [hourH],
  );
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          pinchBaseH.current = hourHRef.current;
          pinchBaseScroll.current = scrollY.current;
        })
        .onUpdate((e) => {
          const next = Math.max(
            HOUR_H_MIN,
            Math.min(HOUR_H_MAX, Math.round(pinchBaseH.current * e.scale)),
          );
          setHourH(next);
          // Keep the top-of-viewport time roughly fixed while zooming.
          scrollRef.current?.scrollTo({
            y: (pinchBaseScroll.current * next) / pinchBaseH.current,
            animated: false,
          });
        }),
    [],
  );

  // Start scrolled near the current hour instead of at midnight.
  useEffect(() => {
    const y = Math.max(0, (now.getHours() - 1) * hourH);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colLeft = useCallback((dayIndex: number) => LABEL_W + dayIndex * colW, [colW]);

  const computeDrop = useCallback(
    (ex: number, ey: number, b: CalendarBlock, durMin: number) => {
      const startDay = new Date(b.startAt);
      const curCol = Math.max(
        0,
        days.findIndex((d) => sameDay(d, startDay)),
      );
      const gridX = colLeft(curCol) + 2 + ex;
      const gridY = timeToY(new Date(b.startAt)) + ey;
      return resolveDrop(days, gridX, gridY, LABEL_W, colW, durMin, hourH);
    },
    [days, colLeft, timeToY, colW, hourH],
  );

  // Stable so memoized blocks only rebuild their gesture when geometry (hourH /
  // colW / days) actually changes — not on every drag-frame re-render.
  const updateDrag = useCallback(
    (ex: number, ey: number, b: CalendarBlock, durMin: number, color: string) => {
      const drop = computeDrop(ex, ey, b, durMin);
      setDrag({
        id: b.id,
        durMin,
        left: colLeft(drop.dayIndex) + 2,
        top: (drop.minutes / 60) * hourH,
        color,
        title: b.title,
      });
    },
    [computeDrop, colLeft, hourH],
  );

  const commitDrag = useCallback(
    (ex: number, ey: number, b: CalendarBlock, durMin: number) => {
      const drop = computeDrop(ex, ey, b, durMin);
      setDrag(null);
      if (drop.startISO !== b.startAt) moveBlock(b.id, drop.startISO);
    },
    [computeDrop, moveBlock],
  );

  const openDraft = useCallback(
    (day: Date, y: number) => {
      const minutes = snapMinutes(yToMinutes(y, hourH), SNAP_MIN, DEFAULT_DURATION_MIN);
      const startISO = combineDayTime(day, minutes).toISOString();
      const col = days.findIndex((dd) => sameDay(dd, day));
      setDraft({
        startISO,
        left: LABEL_W + Math.max(0, col) * colW + 2,
        top: (minutes / 60) * hourH,
        day,
      });
    },
    [hourH, days, colW],
  );

  // Per-day block grouping + overlap lane-packing, memoized so the filter + layout
  // don't re-run for every day on every render (drag/pinch/draft state changes).
  const dayData = useMemo(
    () =>
      days.map((day) => {
        const dayBlocks = blocks.filter((b) => sameDay(new Date(b.startAt), day));
        return { day, dayBlocks, layout: layoutDayBlocks(dayBlocks) };
      }),
    [days, blocks],
  );

  return (
    <View style={styles.flex1}>
      <View style={styles.tlHeaderRow}>
        <View style={styles.labelCol} />
        {days.map((d) => {
          const isToday = sameDay(d, now);
          return (
            <View key={d.toISOString()} style={styles.tlDayHeader}>
              <Text style={styles.tlWeekday}>
                {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </Text>
              <View
                style={[
                  styles.tlDayCircle,
                  // eslint-disable-next-line react-native/no-inline-styles
                  { backgroundColor: isToday ? colors.accentPrimary : 'transparent' },
                ]}
              >
                <Text
                  style={[styles.tlDayNum, { color: isToday ? colors.bgBase : colors.textPrimary }]}
                >
                  {d.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* scrollable hour grid (absolute-fill so the ScrollView bounds + scrolls on web) */}
      <View style={styles.tlScrollWrap}>
        <ScrollView
          ref={scrollRef}
          style={styles.tlScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.tlScrollContent}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <GestureDetector gesture={pinch}>
            <View
              style={[styles.tlGrid, { height: gridH }]}
              onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
            >
              <View style={styles.labelCol}>
                {HOURS.map((h) => (
                  <View key={h} style={{ height: hourH }}>
                    <Text style={styles.hourLabel}>{h}:00</Text>
                  </View>
                ))}
              </View>
              {dayData.map(({ day: d, dayBlocks, layout: dayLayout }) => {
                const isToday = sameDay(d, now);
                // runOnJS(true): handlers run on the JS thread (they only call setState/
                // store actions), so nothing — notably the `Date` `d` — is serialized to a
                // worklet. Serializing a Date crashes on native ("Cannot copy value of type Date").
                const bgTap = Gesture.Tap()
                  .runOnJS(true)
                  .onEnd((e) => openDraft(d, e.y));
                const bgLong = Gesture.LongPress()
                  .minDuration(300)
                  .runOnJS(true)
                  .onStart((e) => {
                    grabTick();
                    openDraft(d, e.y);
                  });
                const bgGesture = Platform.OS === 'web' ? bgTap : bgLong;
                return (
                  <View key={d.toISOString()} style={styles.tlDayCol}>
                    <GestureDetector gesture={bgGesture}>
                      <View>
                        {HOURS.map((h) => (
                          <View key={h} style={[styles.tlHourCell, { height: hourH }]} />
                        ))}
                      </View>
                    </GestureDetector>
                    {dayBlocks.map((b) => {
                      const start = new Date(b.startAt);
                      const end = new Date(b.endAt);
                      const top = timeToY(start);
                      const lay = dayLayout.get(b.id);
                      return (
                        <TimelineBlock
                          key={b.id}
                          block={b}
                          color={colorOf(b.contextId)}
                          top={top}
                          height={Math.max(timeToY(end) - top, 15)}
                          durMin={(end.getTime() - start.getTime()) / 60000}
                          col={lay?.col ?? 0}
                          cols={lay?.cols ?? 1}
                          colW={colW}
                          isDragging={drag?.id === b.id}
                          onUpdateDrag={updateDrag}
                          onCommitDrag={commitDrag}
                          onOpen={onOpenBlock}
                        />
                      );
                    })}
                    {isToday && now.getHours() >= HOUR_START && now.getHours() < HOUR_END ? (
                      <View style={[styles.nowLine, { top: timeToY(now) }]}>
                        <View style={styles.nowDot} />
                        <View style={styles.nowBar} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {drag ? (
                <DragPreview
                  left={drag.left}
                  top={drag.top}
                  width={colW - 4}
                  height={overlayHeightForMin(drag.durMin, hourH)}
                  color={drag.color}
                  title={drag.title}
                />
              ) : null}
              {draft ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.draftBlock,
                    {
                      left: draft.left,
                      top: draft.top,
                      width: colW - 4,
                      height: overlayHeightForMin(DEFAULT_DURATION_MIN, hourH),
                    },
                  ]}
                />
              ) : null}
            </View>
          </GestureDetector>
        </ScrollView>
      </View>
      {draft ? (
        <NewTaskSheet
          startISO={draft.startISO}
          durationMin={DEFAULT_DURATION_MIN}
          onCreate={createAt}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </View>
  );
}

// A single timeline event block. Memoized (and its gesture useMemo'd, per RNGH v2)
// so a drag re-render of the parent only re-renders the block being dragged — the
// rest keep the same props and bail out.
const TimelineBlock = memo(function TimelineBlock({
  block,
  color,
  top,
  height,
  durMin,
  col,
  cols,
  colW,
  isDragging,
  onUpdateDrag,
  onCommitDrag,
  onOpen,
}: {
  block: CalendarBlock;
  color: string;
  top: number;
  height: number;
  durMin: number;
  col: number;
  cols: number;
  colW: number;
  isDragging: boolean;
  onUpdateDrag: (ex: number, ey: number, b: CalendarBlock, durMin: number, color: string) => void;
  onCommitDrag: (ex: number, ey: number, b: CalendarBlock, durMin: number) => void;
  onOpen: (id: string) => void;
}) {
  // Overlapping blocks split the column into side-by-side lanes.
  const usable = colW > 0 ? colW - 4 : 0;
  const laneStyle =
    cols > 1 && usable > 0
      ? { left: 2 + (col * usable) / cols, width: usable / cols - 1 }
      : { left: 2, right: 2 };

  // runOnJS(true): handlers run on the JS thread (setState / store only), so the
  // captured `block` (carrying `Date`s) is never serialized to a worklet — that
  // crashes native ("Cannot copy value of type Date").
  const gesture = useMemo(() => {
    const panBase = Gesture.Pan()
      .runOnJS(true)
      .onStart(() => grabTick())
      .onUpdate((e) => onUpdateDrag(e.x, e.y, block, durMin, color))
      .onEnd((e) => onCommitDrag(e.x, e.y, block, durMin));
    const pan =
      Platform.OS === 'web'
        ? panBase.activeOffsetX([-4, 4]).activeOffsetY([-4, 4])
        : panBase.activateAfterLongPress(220);
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => onOpen(block.id));
    return Gesture.Exclusive(pan, tap);
  }, [block, durMin, color, onUpdateDrag, onCommitDrag, onOpen]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.tlBlock,
          laneStyle,
          // eslint-disable-next-line react-native/no-inline-styles
          {
            top,
            height,
            backgroundColor: block.done ? `${color}12` : `${color}26`,
            borderLeftColor: color,
            opacity: isDragging ? 0.35 : block.done ? 0.6 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={2}
          style={[
            styles.tlBlockText,
            // eslint-disable-next-line react-native/no-inline-styles
            {
              color: block.done ? colors.textMuted : colors.textPrimary,
              textDecorationLine: block.done ? 'line-through' : 'none',
            },
          ]}
        >
          {block.title}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
});

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
    <View style={styles.flex1}>
      <View style={styles.mvWeekRow}>
        {weekdays.map((w) => (
          <Text key={w} style={styles.mvWeekday}>
            {w.toUpperCase()}
          </Text>
        ))}
      </View>
      <View style={styles.mvGrid}>
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
              style={[styles.mvCell, { width: `${100 / 7}%`, height: `${100 / 6}%` }]}
            >
              <View
                style={[
                  styles.mvDayCircle,
                  // eslint-disable-next-line react-native/no-inline-styles
                  { backgroundColor: isToday ? colors.accentPrimary : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.mvDayNum,
                    // eslint-disable-next-line react-native/no-inline-styles
                    {
                      fontWeight: isToday ? '700' : '500',
                      color: isToday
                        ? colors.bgBase
                        : inMonth
                          ? colors.textPrimary
                          : colors.textFaint,
                    },
                  ]}
                >
                  {d.getDate()}
                </Text>
              </View>
              <View style={styles.mvBars}>
                {dayBlocks.slice(0, MAX_BARS).map((b) => {
                  const c = colorOf(b.contextId);
                  return (
                    <View
                      key={b.id}
                      style={[
                        styles.mvBar,
                        // eslint-disable-next-line react-native/no-inline-styles
                        {
                          backgroundColor: `${c}2E`,
                          borderLeftColor: c,
                          opacity: b.done ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.mvBarText,
                          // eslint-disable-next-line react-native/no-inline-styles
                          {
                            color: b.done ? colors.textMuted : colors.textSecondary,
                            textDecorationLine: b.done ? 'line-through' : 'none',
                          },
                        ]}
                      >
                        {b.title}
                      </Text>
                    </View>
                  );
                })}
                {dayBlocks.length > MAX_BARS ? (
                  <Text style={styles.mvMore}>+{dayBlocks.length - MAX_BARS}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  // CalendarScreen — header
  headerContainer: { gap: 12, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, color: colors.textPrimary },
  headerNav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
  },
  todayText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  modeBar: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: 10,
    backgroundColor: colors.bgCard,
    alignSelf: 'flex-start',
  },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  modeBtnText: { fontSize: 12.5 },
  // CalendarScreen — wide/mobile layout
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.bgBase },
  sidebar: {
    width: 240,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#10141B',
    borderRightWidth: 1,
    borderRightColor: colors.bgCard,
  },
  sidebarLogo: { paddingHorizontal: 8, paddingBottom: 20 },
  sidebarLogoText: {
    fontFamily: monoFont,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textMuted,
  },
  signOutBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  signOutText: { fontSize: 12, color: colors.textMuted },
  wideMain: { flex: 1, paddingHorizontal: 24 },
  mobileRoot: { flex: 1, backgroundColor: colors.bgSurface },
  mobileInner: { paddingHorizontal: 16, flex: 1 },
  // NavBtn
  navBtn: { padding: 7, borderRadius: 8, backgroundColor: colors.bgElevated },
  // Timeline
  tlHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.bgCard,
    paddingBottom: 6,
  },
  labelCol: { width: LABEL_W },
  tlDayHeader: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  tlWeekday: { fontFamily: monoFont, fontSize: 9.5, letterSpacing: 0.5, color: colors.textMuted },
  tlDayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlDayNum: { fontSize: 13, fontWeight: '600' },
  tlScrollWrap: { flex: 1, minHeight: 0 },
  tlScroll: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tlScrollContent: { paddingBottom: 24 },
  tlGrid: { flexDirection: 'row' },
  hourLabel: {
    position: 'absolute',
    top: -6,
    right: 6,
    fontFamily: monoFont,
    fontSize: 9,
    color: colors.textFaint,
  },
  tlDayCol: { flex: 1, borderLeftWidth: 1, borderLeftColor: colors.bgCard },
  tlHourCell: { borderTopWidth: 1, borderTopColor: '#151A22' },
  nowLine: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentNow,
    marginLeft: -3,
  },
  nowBar: { flex: 1, height: 1, backgroundColor: colors.accentNow },
  draftBlock: {
    position: 'absolute',
    borderRadius: 5,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accentPrimary,
    backgroundColor: `${colors.accentPrimary}18`,
  },
  // TimelineBlock
  tlBlock: {
    position: 'absolute',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingTop: 2,
    overflow: 'hidden',
    borderLeftWidth: 2.5,
  },
  tlBlockText: { fontSize: 10 },
  // MonthView
  mvWeekRow: { flexDirection: 'row', paddingBottom: 8 },
  mvWeekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: monoFont,
    fontSize: 9.5,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  mvGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  mvCell: { padding: 4, borderWidth: 0.5, borderColor: colors.bgCard },
  mvDayCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mvDayNum: { fontSize: 12 },
  mvBars: { marginTop: 3, gap: 1.5 },
  mvBar: { borderRadius: 2, paddingHorizontal: 3, paddingVertical: 0.5, borderLeftWidth: 2 },
  mvBarText: { fontSize: 8, lineHeight: 11 },
  mvMore: { fontSize: 7.5, color: colors.textMuted, paddingLeft: 3 },
});

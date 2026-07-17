# Calendar Interactions (Batch D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the calendar timeline directly manipulable — drag a block to reschedule, tap a block to open it, and press an empty slot to create a task.

**Architecture:** Per-block `react-native-gesture-handler` gestures (Tap raced with a platform-specific move gesture) plus a per-column background gesture for create. A Reanimated grid-level overlay renders the live drag + snap-preview so a block can cross day columns. Moves reuse the existing `patchTask({dueAt})` path optimistically; create reuses `POST /api/tasks`. No new backend logic except a single-task GET for tap-to-open.

**Tech Stack:** Expo / React Native (+ RN Web), `react-native-gesture-handler` 2.32, `react-native-reanimated` 4.5, Zustand stores, Express + Drizzle.

**Verification model (project convention — no unit-test runner):** pure functions are checked with a throwaway `tsx` assertion script (written first, run, deleted); UI/gesture behavior is verified with `typecheck` + a browser walkthrough on web. Commit after each task.

**Spec:** `docs/superpowers/specs/2026-07-17-calendar-interactions-design.md`

---

## File Structure

- **Modify** `app/src/features/calendar/calendar-dates.ts` — add pure coordinate helpers (`HOUR_H` moves here as the single source; `yToMinutes`, `snapMinutes`, `xToDayIndex`, `combineDayTime`).
- **Modify** `server/src/routes/tasks.ts` — add `GET /:id` (single task) for tap-to-open.
- **Modify** `app/src/lib/api.ts` — add `getTask(id)`.
- **Modify** `app/src/store/calendar.ts` — add optimistic `moveBlock(id, newStartISO)` and `createAt(title, startISO, durationMin)`.
- **Create** `app/src/features/calendar/calendar-overlay.tsx` — drag overlay, snap-preview, ghost block (Reanimated).
- **Create** `app/src/features/calendar/use-calendar-gestures.ts` — gesture composition + shared values + px→time mapping.
- **Create** `app/src/features/tasks/new-task-sheet.tsx` — minimal ghost-create sheet (title + prefilled deadline/duration).
- **Modify** `app/src/features/calendar/calendar-screen.tsx` — consume `HOUR_H` from dates, make blocks pressable (tap→open), mount create gesture + overlay + detail/new-task modals.

---

## Task 1: Coordinate helpers (pure)

**Files:**
- Modify: `app/src/features/calendar/calendar-dates.ts`
- Temp verify: `app/src/features/calendar/_verify_coords_tmp.ts` (deleted at end)

- [ ] **Step 1: Write the failing assertion script**

Create `app/src/features/calendar/_verify_coords_tmp.ts`:

```ts
import { yToMinutes, snapMinutes, xToDayIndex, combineDayTime, HOUR_H } from './calendar-dates';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  if (!ok) fails++;
};

eq('HOUR_H is 48', HOUR_H, 48);
eq('yToMinutes top = 0', yToMinutes(0), 0);
eq('yToMinutes one hour', yToMinutes(HOUR_H), 60);
eq('yToMinutes half hour', yToMinutes(HOUR_H / 2), 30);
eq('snap 37 -> 30', snapMinutes(37), 30);
eq('snap 38 -> 45', snapMinutes(38), 45);
eq('snap clamps to grid end (dur 60)', snapMinutes(24 * 60 - 10, 15, 60), 24 * 60 - 60);
eq('xToDayIndex first col', xToDayIndex(50, 44, 100, 7), 0);
eq('xToDayIndex third col', xToDayIndex(44 + 250, 44, 100, 7), 2);
eq('xToDayIndex clamps high', xToDayIndex(99999, 44, 100, 7), 6);
eq('xToDayIndex clamps low (label area)', xToDayIndex(0, 44, 100, 7), 0);

const day = new Date(2026, 6, 20); // Jul 20 2026 local
eq('combineDayTime 9:30', combineDayTime(day, 570).toISOString(), new Date(2026, 6, 20, 9, 30).toISOString());

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it — expect failure (helpers not defined yet)**

Run: `npm --workspace app exec tsx src/features/calendar/_verify_coords_tmp.ts`
Expected: FAIL — `yToMinutes` / `snapMinutes` / etc. not exported.

- [ ] **Step 3: Add the helpers**

In `app/src/features/calendar/calendar-dates.ts`, add near the existing `HOUR_START`/`HOUR_END`:

```ts
// Timeline geometry (single source; calendar-screen imports HOUR_H from here).
export const HOUR_H = 48;
export const SNAP_MIN = 15;

// Pixel Y within the hour grid -> minutes past midnight.
export const yToMinutes = (y: number, hourH: number = HOUR_H): number =>
  HOUR_START * 60 + (y / hourH) * 60;

// Snap minutes to the nearest `step`, clamped so a `durationMin` block stays in [0, 24h).
export const snapMinutes = (min: number, step: number = SNAP_MIN, durationMin: number = 0): number => {
  const snapped = Math.round(min / step) * step;
  return Math.max(0, Math.min(24 * 60 - durationMin, snapped));
};

// Pixel X within the grid -> day column index (0-based), clamped to [0, dayCount-1].
export const xToDayIndex = (x: number, labelW: number, colW: number, dayCount: number): number => {
  const i = Math.floor((x - labelW) / colW);
  return Math.max(0, Math.min(dayCount - 1, i));
};

// A local Date at `day`'s midnight + `minutes`.
export const combineDayTime = (day: Date, minutes: number): Date =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0 + minutes * 60000);
```

Note: `combineDayTime` uses ms in the last arg so `minutes*60000` offsets correctly from midnight.

- [ ] **Step 4: Run it — expect PASS**

Run: `npm --workspace app exec tsx src/features/calendar/_verify_coords_tmp.ts`
Expected: `ALL PASS`.

- [ ] **Step 5: Delete the temp script + typecheck**

Run:
```bash
rm app/src/features/calendar/_verify_coords_tmp.ts
npm --workspace app run typecheck
```
Expected: no output errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/features/calendar/calendar-dates.ts
git commit -m "feat(calendar): pure coordinate helpers for drag/snap"
```

---

## Task 2: Single-task GET + tap-to-open detail from the calendar

**Files:**
- Modify: `server/src/routes/tasks.ts`
- Modify: `app/src/lib/api.ts`
- Modify: `app/src/features/calendar/calendar-screen.tsx`

- [ ] **Step 1: Add `GET /:id` route**

In `server/src/routes/tasks.ts`, add after the `GET '/'` handler (before `POST '/'`):

```ts
router.get('/:id', async (req, res) => {
  res.json(await svc.getTask(req.params.id));
});
```

(`svc.getTask` already exists and throws `notFound` if missing.)

- [ ] **Step 2: Verify the route (server running via tsx watch)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/tasks/does-not-exist
```
Expected: `401` (auth guard) or `404` if you attach a token — either proves the route is mounted, not a generic 404 from an unmatched path. (Authenticated: a real id returns the task JSON.)

- [ ] **Step 3: Add `api.getTask`**

In `app/src/lib/api.ts`, in the `api` object next to `updateTask`:

```ts
  getTask: (id: string) => request<Task>(`/api/tasks/${id}`),
```

- [ ] **Step 4: Render a detail modal in the calendar screen, opened on block tap**

In `app/src/features/calendar/calendar-screen.tsx`:

Add imports at the top:
```ts
import { useState } from 'react';
import type { Task } from '@task-manager/shared';
import { api } from '../../lib/api';
import { TaskDetail } from '../tasks/task-detail';
```

Inside `CalendarScreen`, add state + handlers:
```ts
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const openBlock = async (taskId: string) => {
    try {
      setDetailTask(await api.getTask(taskId));
    } catch {
      /* ignore — task may have been deleted */
    }
  };
```

Pass `openBlock` down to `Timeline` (add it to the `Timeline` props type `onOpenBlock: (id: string) => void` and thread it), and wrap the block `View` in a `Pressable`:
```tsx
// in Timeline, replace the block <View ...> with:
<Pressable
  key={b.id}
  onPress={() => onOpenBlock(b.id)}
  style={{ position: 'absolute', left: 2, right: 2, top, height, borderRadius: 5, paddingHorizontal: 5, paddingTop: 2, overflow: 'hidden', backgroundColor: b.done ? `${c}12` : `${c}26`, borderLeftWidth: 2.5, borderLeftColor: c, opacity: b.done ? 0.6 : 1 }}
>
  <Text numberOfLines={2} style={{ fontSize: 10, color: b.done ? colors.textMuted : colors.textPrimary, textDecorationLine: b.done ? 'line-through' : 'none' }}>{b.title}</Text>
</Pressable>
```
(Ensure `Pressable` is imported from `react-native` — it already is.)

Render the modal near the end of `CalendarScreen`'s return (wrap the existing return in a fragment if needed), after the main view:
```tsx
      {detailTask ? (
        <TaskDetail
          task={detailTask}
          contexts={contexts}
          onClose={() => setDetailTask(null)}
          onPatch={async (id, patch) => {
            await useTasksStore.getState().patchTask(id, patch);
            setDetailTask((t) => (t && t.id === id ? { ...t, ...patch } as Task : t));
            load();
          }}
          onDelete={async (id) => {
            await useTasksStore.getState().removeTask(id);
            setDetailTask(null);
            load();
          }}
        />
      ) : null}
```
(`useTasksStore` and `load` are already in scope in `CalendarScreen`.)

- [ ] **Step 5: Typecheck**

Run: `npm --workspace app run typecheck` and `npm --workspace server run typecheck`
Expected: both clean.

- [ ] **Step 6: Browser verify (web)**

Reload `http://localhost:8081/calendar`. Click a block → the task-detail modal opens with that task. Change its deadline in the modal → on close the block moves on the grid (calendar reloaded).

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/tasks.ts app/src/lib/api.ts app/src/features/calendar/calendar-screen.tsx
git commit -m "feat(calendar): tap a block to open task detail"
```

---

## Task 3: Optimistic store actions (move + create)

**Files:**
- Modify: `app/src/store/calendar.ts`

- [ ] **Step 1: Add `moveBlock` and `createAt` to the calendar store**

In `app/src/store/calendar.ts`, extend the state interface:
```ts
  moveBlock: (id: string, newStartISO: string) => Promise<void>;
  createAt: (title: string, startISO: string, durationMin: number) => Promise<void>;
```

Add these imports at top:
```ts
import { api } from '../lib/api';
import { useTasksStore } from './tasks';
```

Implement inside the store (after `goToToday`):
```ts
  async moveBlock(id, newStartISO) {
    const prev = get().data;
    if (!prev) return;
    const blk = prev.blocks.find((b) => b.id === id);
    if (!blk) return;
    const durMs = new Date(blk.endAt).getTime() - new Date(blk.startAt).getTime();
    const newEnd = new Date(new Date(newStartISO).getTime() + durMs).toISOString();
    // optimistic
    set({ data: { blocks: prev.blocks.map((b) => (b.id === id ? { ...b, startAt: newStartISO, endAt: newEnd } : b)) } });
    try {
      await useTasksStore.getState().patchTask(id, { dueAt: newStartISO });
    } catch {
      set({ data: prev }); // rollback
    }
  },

  async createAt(title, startISO, durationMin) {
    const t = title.trim();
    if (!t) return;
    await api.createTask({ title: t, dueAt: startISO, durationMin });
    await get().load();
    useTasksStore.getState().load();
  },
```

(`api.getCalendar` is already imported via `../lib/api`? It's used through `api` — confirm the file imports `api`; if it already imports `{ api }`, don't duplicate.)

- [ ] **Step 2: Typecheck**

Run: `npm --workspace app run typecheck`
Expected: clean. (No runtime path yet — wired in Tasks 4 & 5.)

- [ ] **Step 3: Commit**

```bash
git add app/src/store/calendar.ts
git commit -m "feat(calendar): optimistic moveBlock + createAt store actions"
```

---

## Task 4: Drag-to-move gesture + overlay

**Files:**
- Create: `app/src/features/calendar/calendar-overlay.tsx`
- Create: `app/src/features/calendar/use-calendar-gestures.ts`
- Modify: `app/src/features/calendar/calendar-screen.tsx`

- [ ] **Step 1: Create the drag state hook**

Create `app/src/features/calendar/use-calendar-gestures.ts`:

```ts
import { useState } from 'react';
import type { CalendarBlock } from '@task-manager/shared';
import { HOUR_H, SNAP_MIN, yToMinutes, snapMinutes, xToDayIndex, combineDayTime } from './calendar-dates';

export interface DragState {
  block: CalendarBlock;
  durMs: number;
  // live snapped landing (recomputed on each move)
  dayIndex: number;
  minutes: number;
}

// Maps a drop (gridX, gridY within the scroll content) to a snapped start Date.
export function resolveDrop(
  days: Date[],
  gridX: number,
  gridY: number,
  labelW: number,
  colW: number,
  durationMin: number,
): { dayIndex: number; minutes: number; startISO: string } {
  const dayIndex = xToDayIndex(gridX, labelW, colW, days.length);
  const minutes = snapMinutes(yToMinutes(gridY, HOUR_H), SNAP_MIN, durationMin);
  const startISO = combineDayTime(days[dayIndex], minutes).toISOString();
  return { dayIndex, minutes, startISO };
}
```

- [ ] **Step 2: Create the overlay component**

Create `app/src/features/calendar/calendar-overlay.tsx`:

```tsx
import { Text, View } from 'react-native';
import { colors } from '../../theme';
import { HOUR_H } from './calendar-dates';

// A static (non-animated) preview rectangle for the snapped landing slot, plus
// the lifted block. Positioned by the parent using absolute left/top/width/height.
export function DragPreview({
  left,
  top,
  width,
  height,
  color,
  title,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  title: string;
}) {
  return (
    <>
      {/* snap-target outline */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left, top, width, height, borderRadius: 5, borderWidth: 1.5, borderColor: color, borderStyle: 'dashed', backgroundColor: `${color}18` }}
      />
      {/* lifted block label */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left, top, width, height, borderRadius: 5, paddingHorizontal: 5, paddingTop: 2, backgroundColor: `${color}40`, borderLeftWidth: 2.5, borderLeftColor: color, transform: [{ scale: 1.02 }], shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
      >
        <Text numberOfLines={2} style={{ fontSize: 10, color: colors.textPrimary }}>{title}</Text>
      </View>
    </>
  );
}

export const overlayHeightForMin = (durMin: number) => (durMin / 60) * HOUR_H;
```

- [ ] **Step 3: Wire the move gesture into the timeline**

In `app/src/features/calendar/calendar-screen.tsx`:

Replace the `HOUR_H` local const with an import from `./calendar-dates` (remove `const HOUR_H = 48;`, add `HOUR_H` to the existing `calendar-dates` import).

Add imports:
```ts
import { Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useCalendarStore } from '../../store/calendar';
import { DragPreview, overlayHeightForMin } from './calendar-overlay';
import { resolveDrop } from './use-calendar-gestures';
```

In `Timeline`, capture the grid width and column width. Add near the top of `Timeline`:
```ts
  const moveBlock = useCalendarStore((s) => s.moveBlock);
  const [gridW, setGridW] = useState(0);
  const [drag, setDrag] = useState<null | { id: string; durMin: number; left: number; top: number; color: string; title: string }>(null);
  const colW = gridW > 0 ? (gridW - LABEL_W) / days.length : 0;
```

Wrap the outer grid `View` (the one with `flexDirection: 'row', height: GRID_H`) so we can measure it:
```tsx
<View style={{ flexDirection: 'row', height: GRID_H }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
```

For each block, build a move gesture. Replace the block `Pressable` (from Task 2) with a `GestureDetector`-wrapped animated view. Define the gesture inside the block `.map` callback:
```tsx
{dayBlocks.map((b) => {
  const start = new Date(b.startAt);
  const end = new Date(b.endAt);
  const top = timeToY(start);
  const height = Math.max(timeToY(end) - top, 15);
  const c = colorOf(b.contextId);
  const durMin = (end.getTime() - start.getTime()) / 60000;

  const tap = Gesture.Tap().onEnd(() => runOnJS(onOpenBlock)(b.id));
  const pan = Gesture.Pan()
    .activateAfterLongPress(Platform.OS === 'web' ? 0 : 220)
    .onStart(() => runOnJS(setDrag)({ id: b.id, durMin, left: LABEL_W, top, color: c, title: b.title }))
    .onUpdate((e) => {
      // absoluteX/Y are screen coords; convert to grid coords via measured layout below (see note)
      runOnJS(updateDrag)(e.x, e.y, b, durMin, c);
    })
    .onEnd((e) => runOnJS(commitDrag)(e.x, e.y, b, durMin));
  const gesture = Gesture.Exclusive(pan, tap);

  return (
    <GestureDetector key={b.id} gesture={gesture}>
      <Animated.View style={{ position: 'absolute', left: 2, right: 2, top, height, borderRadius: 5, paddingHorizontal: 5, paddingTop: 2, overflow: 'hidden', backgroundColor: b.done ? `${c}12` : `${c}26`, borderLeftWidth: 2.5, borderLeftColor: c, opacity: drag?.id === b.id ? 0.35 : b.done ? 0.6 : 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 10, color: b.done ? colors.textMuted : colors.textPrimary, textDecorationLine: b.done ? 'line-through' : 'none' }}>{b.title}</Text>
      </Animated.View>
    </GestureDetector>
  );
})}
```

Add `import Animated from 'react-native-reanimated';` (Reanimated default export) and the JS helpers inside `Timeline` (the gesture callbacks pass gesture-local x/y, which are relative to the block; convert to grid coords by adding the block column origin — see note):

```ts
  const colLeft = (dayIndex: number) => LABEL_W + dayIndex * colW;

  // e.x/e.y from Pan are relative to the block. Grid coords = column origin + block-relative.
  const updateDrag = (ex: number, ey: number, b: CalendarBlock, durMin: number, color: string) => {
    const startDay = new Date(b.startAt);
    const curCol = days.findIndex((d) => sameDay(d, startDay));
    const gridX = colLeft(Math.max(0, curCol)) + ex;
    const gridY = timeToY(new Date(b.startAt)) + ey;
    const drop = resolveDrop(days, gridX, gridY, LABEL_W, colW, durMin);
    setDrag({ id: b.id, durMin, left: colLeft(drop.dayIndex) + 2, top: (drop.minutes / 60) * HOUR_H, color, title: b.title });
  };

  const commitDrag = (ex: number, ey: number, b: CalendarBlock, durMin: number) => {
    const startDay = new Date(b.startAt);
    const curCol = days.findIndex((d) => sameDay(d, startDay));
    const gridX = colLeft(Math.max(0, curCol)) + ex;
    const gridY = timeToY(new Date(b.startAt)) + ey;
    const drop = resolveDrop(days, gridX, gridY, LABEL_W, colW, durMin);
    setDrag(null);
    if (drop.startISO !== b.startAt) moveBlock(b.id, drop.startISO);
  };
```

Render the preview inside the day-columns container (as a sibling of the columns, absolutely positioned) when `drag` is set:
```tsx
{drag ? (
  <DragPreview left={drag.left} top={drag.top} width={colW - 4} height={overlayHeightForMin(drag.durMin)} color={drag.color} title={drag.title} />
) : null}
```

> **Note for the implementer:** RNGH `Pan` event `e.x/e.y` are relative to the GestureDetector view (the block). The math above reconstructs grid coordinates from the block's known column + top. If drift appears in testing, switch to `e.absoluteX/absoluteY` minus the grid's measured page offset (capture via `measureInWindow` in `onLayout`); prefer the simpler relative math first and only add page-offset measurement if the browser walkthrough shows the drop landing off by a column/row.

- [ ] **Step 4: Typecheck**

Run: `npm --workspace app run typecheck`
Expected: clean.

- [ ] **Step 5: Browser verify (web) + Neon check**

Reload `/calendar` (Week view). Click-drag a block to a different time and a different day column; it should drop snapped to 15 min. Then confirm persistence:
```bash
# replace TITLE with the dragged block's title
psql "$DATABASE_URL" -c "SELECT title, to_char(due_at,'YYYY-MM-DD HH24:MI') FROM tasks WHERE title LIKE '%TITLE%';"
```
(or use the Neon MCP `run_sql`). Expected: `due_at` reflects the new day + snapped time. A click without dragging still opens the detail modal (Task 2 behavior preserved).

- [ ] **Step 6: Commit**

```bash
git add app/src/features/calendar/use-calendar-gestures.ts app/src/features/calendar/calendar-overlay.tsx app/src/features/calendar/calendar-screen.tsx
git commit -m "feat(calendar): drag a block to reschedule (snap 15m, cross-day, optimistic)"
```

---

## Task 5: Create — ghost block + minimal new-task sheet

**Files:**
- Create: `app/src/features/tasks/new-task-sheet.tsx`
- Modify: `app/src/features/calendar/calendar-screen.tsx`

- [ ] **Step 1: Create the minimal new-task sheet**

Create `app/src/features/tasks/new-task-sheet.tsx`:

```tsx
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { colors, radius, shortDateTime, webInputReset } from '../../theme';
import { DateFieldsSection } from './date-fields-section';

const WIDE = 768;
const isIOS = process.env.EXPO_OS === 'ios';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Minimal create form for the calendar ghost-create flow. Holds state locally and
// persists only via onCreate (title required). Deadline/Duration prefilled to the slot.
export function NewTaskSheet({
  startISO,
  durationMin,
  onCreate,
  onClose,
}: {
  startISO: string;
  durationMin: number;
  onCreate: (title: string, startISO: string, durationMin: number) => Promise<void>;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(startISO);
  const [dur, setDur] = useState<number>(durationMin);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy || !due) return;
    setBusy(true);
    try {
      await onCreate(title, due, dur);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(5,6,10,0.6)', justifyContent: wide ? 'center' : 'flex-end', alignItems: wide ? 'center' : 'stretch' }}>
        <AnimatedPressable
          entering={wide ? undefined : SlideInDown.duration(260)}
          onPress={(e) => e.stopPropagation?.()}
          style={wide
            ? { width: 460, maxWidth: '92%', borderRadius: 20, borderCurve: 'continuous', backgroundColor: colors.bgCardWeb, borderWidth: 1, borderColor: colors.borderSubtle }
            : { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderCurve: 'continuous', backgroundColor: colors.bgCardWeb }}
        >
          <KeyboardAvoidingView behavior={isIOS ? 'padding' : undefined}>
            <View style={{ padding: 20, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>New task · {shortDateTime(startISO)}</Text>
                <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6, borderRadius: 8, backgroundColor: colors.bgElevated }}>
                  <X size={15} color={colors.textSecondary} />
                </Pressable>
              </View>
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={submit}
                placeholder="Task title…"
                placeholderTextColor={colors.textMuted}
                style={{ fontSize: 16, color: colors.textPrimary, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, ...webInputReset }}
              />
              <DateFieldsSection
                dueAt={due}
                remindAt={null}
                durationMin={dur}
                onChangeDue={setDue}
                onChangeRemind={() => {}}
                onChangeDuration={setDur}
              />
              <Pressable onPress={submit} disabled={!title.trim()} style={{ alignItems: 'center', paddingVertical: 12, borderRadius: radius.card, backgroundColor: title.trim() ? colors.accentPrimary : colors.bgElevated }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: title.trim() ? colors.bgSurface : colors.textMuted }}>Create</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </AnimatedPressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 2: Mount the background create gesture + ghost + sheet in the timeline**

In `calendar-screen.tsx` `Timeline`, add:
```ts
  const createAt = useCalendarStore((s) => s.createAt);
  const [draft, setDraft] = useState<null | { startISO: string; left: number; top: number; day: Date }>(null);
```

Import the sheet + ghost pieces:
```ts
import { NewTaskSheet } from '../tasks/new-task-sheet';
```

For each day column, wrap its background in a create gesture. In the `days.map` that renders each column `View`, add a `GestureDetector` around the column's hour-cells background (NOT the blocks — blocks render above and capture their own gestures). Build the gesture per column:
```tsx
const bgTap = Gesture.Tap().onEnd((e) => runOnJS(openDraft)(d, e.y));
const bgLong = Gesture.LongPress().minDuration(300).onStart((e) => runOnJS(openDraft)(d, e.y));
const bgGesture = Platform.OS === 'web' ? bgTap : bgLong;
```
and wrap just the stacked hour-cell `View`s:
```tsx
<GestureDetector gesture={bgGesture}>
  <View>
    {HOURS.map((h) => (
      <View key={h} style={{ height: HOUR_H, borderTopWidth: 1, borderTopColor: '#151A22' }} />
    ))}
  </View>
</GestureDetector>
```

Add the handler (e.y is column-relative → grid Y directly since columns start at grid top):
```ts
  const DEFAULT_DUR = 30;
  const openDraft = (day: Date, y: number) => {
    const minutes = snapMinutes(yToMinutes(y, HOUR_H), SNAP_MIN, DEFAULT_DUR);
    const startISO = combineDayTime(day, minutes).toISOString();
    const col = days.findIndex((dd) => sameDay(dd, day));
    setDraft({ startISO, left: LABEL_W + Math.max(0, col) * colW + 2, top: (minutes / 60) * HOUR_H, day });
  };
```
(Import `snapMinutes, yToMinutes, combineDayTime, SNAP_MIN` from `./calendar-dates`.)

Render the ghost block when `draft` is set (sibling of the columns, absolute):
```tsx
{draft ? (
  <View pointerEvents="none" style={{ position: 'absolute', left: draft.left, top: draft.top, width: colW - 4, height: overlayHeightForMin(30), borderRadius: 5, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentPrimary, backgroundColor: `${colors.accentPrimary}18` }} />
) : null}
```

Render the sheet (outside the ScrollView, e.g. after the timeline `View`):
```tsx
{draft ? (
  <NewTaskSheet
    startISO={draft.startISO}
    durationMin={30}
    onCreate={createAt}
    onClose={() => setDraft(null)}
  />
) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm --workspace app run typecheck`
Expected: clean.

- [ ] **Step 4: Browser verify (web) + Neon check**

Reload `/calendar`. Click an empty slot → a dashed ghost appears at the snapped time and the New-task sheet opens showing that time. Type a title → Create → the sheet closes and a real block appears at that slot. Confirm:
```bash
# Neon MCP run_sql or psql
SELECT title, to_char(due_at,'YYYY-MM-DD HH24:MI'), duration_min FROM tasks WHERE title = 'YOUR TITLE';
```
Expected: a row with the snapped `due_at` and `duration_min = 30`. Cancelling the sheet (tap backdrop) creates nothing and clears the ghost.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/tasks/new-task-sheet.tsx app/src/features/calendar/calendar-screen.tsx
git commit -m "feat(calendar): press empty slot to create a task (ghost + minimal sheet)"
```

---

## Task 6: Optional haptic grab tick + final pass

**Files:**
- Modify: `app/src/features/calendar/calendar-screen.tsx` (guarded haptic)

- [ ] **Step 1: Add a guarded haptic on grab (mobile only)**

Only if `expo-haptics` is desired. Install:
```bash
npx expo install expo-haptics
```
In `calendar-screen.tsx`, at the top of the block `pan.onStart` JS handler (`setDrag(...)`), add:
```ts
import * as Haptics from 'expo-haptics';
// ...in setDrag handler (JS thread):
if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
```
If `expo-haptics` is not wanted, skip this task entirely.

- [ ] **Step 2: Full regression walkthrough (web)**

Reload `/calendar`. Verify in one pass: tap block → detail; drag block across day+time → persists; empty press → ghost + sheet → create; done block still dimmed + strikethrough and still draggable; switching Day/3-day/Week keeps all three working; Month view unchanged (tap day → Day).

- [ ] **Step 3: Typecheck both workspaces**

Run: `npm --workspace app run typecheck && npm --workspace server run typecheck`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(calendar): grab haptic + Batch D polish"
```

- [ ] **Step 5: Mobile verification (user, on device)**

On a device build: long-press a block → grab (haptic) → drag → drops snapped; long-press empty → ghost + sheet → create; tap block → detail; plain finger-drag still scrolls the timeline.

---

## Self-Review

**Spec coverage:**
- Move (drag, snap 15, cross-day, optimistic patch, keep duration) → Task 4. ✓
- Create (ghost + minimal sheet, save-on-confirm) → Task 5. ✓
- Open (tap → existing detail) → Task 2. ✓
- Platform matrix (web click-drag / mobile long-press; web click-create / mobile long-press-create) → Task 4 (`activateAfterLongPress` 0 vs 220) + Task 5 (`Tap` vs `LongPress`). ✓
- Coordinate math + snap helpers → Task 1. ✓
- Scope guardrails: Month untouched (gestures only in `Timeline`); no resize; move reuses `patchTask`; create reuses `POST /api/tasks`; single new GET for open. ✓
- Non-goal (auto-scroll on edge) — not implemented, as specified. ✓

**Placeholder scan:** no TBD/TODO; every code step shows code; the one judgment call (relative vs absolute gesture coords) is called out with a concrete fallback, not left vague.

**Type consistency:** `moveBlock(id, newStartISO)` / `createAt(title, startISO, durationMin)` used identically in store (Task 3) and callers (Tasks 4, 5). `resolveDrop`, `snapMinutes`, `yToMinutes`, `xToDayIndex`, `combineDayTime`, `overlayHeightForMin`, `HOUR_H`, `SNAP_MIN` defined once (Tasks 1, 4) and imported by name everywhere they're used. `NewTaskSheet` props match its single call site.

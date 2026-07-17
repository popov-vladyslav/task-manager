# Calendar interactions (Batch D) — design

**Date:** 2026-07-17
**Status:** approved (design)
**Feature:** Direct-manipulation on the calendar timeline — drag a block to reschedule,
long-press/click an empty slot to create a task, tap a block to open it.

## Context

The calendar (`app/src/features/calendar/calendar-screen.tsx`) renders task blocks on a
scrollable 24h timeline (Day / 3-day / Week) plus a Month dot-grid. Blocks are sourced
from `tasks` (`due_at` + `duration_min`); a block spans `[due_at, due_at + duration]`.
Today the calendar is read-only: no way to reschedule or create from it.

Gesture stack already present: `react-native-gesture-handler` 2.32, `react-native-reanimated`
4.5, `react-native-worklets`; `GestureHandlerRootView` is mounted at the app root. No
hand-rolled gestures exist yet. The timeline body is a `ScrollView` (absolute-filled so it
bounds/scrolls on web).

## Goals

- **Move**: drag an existing block to a new time and/or day → updates `due_at`, keeps `duration_min`.
- **Create**: press an empty slot → a ghost block + a minimal create sheet; task is saved only on confirm.
- **Open**: tap/click a block → open the existing task-detail modal.

## Non-goals (this pass)

- Edge-resize to change duration (deferred).
- Auto-scroll while dragging near the top/bottom edge (later polish).
- Gestures in Month view — Month keeps its current behavior (tap a day → Day view).
- Any new backend endpoint — move reuses `PATCH /api/tasks/:id { dueAt }`; create reuses `POST /api/tasks`.

## Interaction model (platform-native)

| Action | Web (mouse) | Mobile (touch) |
|---|---|---|
| Move a block | click-drag | long-press (~220ms) to grab, then drag |
| Open a block | click (no drag) | tap |
| Create | click an empty slot | long-press an empty slot |

Rationale: on mobile a plain finger-drag must still scroll the timeline, so block-drag is
gated behind a long-press (same feel as the task-list reorder). On web the wheel/scrollbar
scrolls, so mouse-drag on a block is unambiguous and needs no long-press. A grabbed block
gets a subtle lift (shadow/scale) and, if `expo-haptics` is available, a haptic tick.

## Architecture — Approach A (per-block gestures + grid-background gesture)

Chosen over a single hit-testing overlay (Approach B) because RNGH gives tap-vs-drag
discrimination and long-press activation for free, and it matches existing patterns.

- **Block gesture** (per block): `Gesture.Tap()` (→ open) raced with a move gesture. Move =
  `Gesture.Pan()` on web; `Gesture.LongPress().simultaneousWithExternalGesture(pan)` (or a
  Pan with `activateAfterLongPress(220)`) on mobile. `Platform.OS` selects the config.
- **Grid-background gesture** (per day column, behind the blocks): a Tap (web) / LongPress
  (mobile) that resolves the pressed slot → opens the create flow. Blocks sit above the
  background so a press on a block hits the block gesture, not create.
- **Live drag layer**: while dragging, the block is drawn as a single grid-level,
  absolutely-positioned overlay driven by a Reanimated shared value, so it can travel across
  day columns. Underneath, a faint snap-preview rectangle shows the landing slot.
- **ScrollView coexistence**: the block Pan uses `blocksExternalGesture(scrollRef)` (or
  simultaneous handlers) so an active block-drag suspends timeline scroll; on mobile the
  long-press activation keeps immediate drags scrolling.

## Coordinate math & snapping

Constants (from `calendar-screen.tsx` / `calendar-dates.ts`): `HOUR_H = 48`, `HOUR_START = 0`,
`LABEL_W = 44`, column width `W = (gridWidth - LABEL_W) / days.length`.

- `y → minutes`: `min = (y / HOUR_H + HOUR_START) * 60`, then **snap to 15** (`round(min/15)*15`),
  clamped to `[0, 24*60 - duration]` so a block can't spill past midnight.
- `x → day`: `col = clamp(floor((x - LABEL_W) / W), 0, days.length - 1)` → `days[col]`.
- New `due_at` = `startOfDay(days[col]) + snappedMinutes` (local → ISO). Duration unchanged.
- Helpers live in `calendar-dates.ts` (pure, unit-checkable): `yToMinutes`, `snapMinutes`,
  `xToDayIndex`.

## Move — flow

1. Grab (web mousedown-drag / mobile long-press) → lift the block, capture its task id + duration.
2. Drag → shared value tracks pointer; overlay + snap-preview follow.
3. Release → compute new `due_at`; if unchanged, no-op.
4. **Optimistic**: update the block in the calendar store immediately; call
   `useTasksStore.patchTask(id, { dueAt })` (existing path — also keeps the task list in sync).
   On failure, revert the block and surface the existing error toast.

## Create — ghost + minimal NewTaskSheet

Pressing an empty slot:
1. Snap the slot → render a **ghost block** (faint, dashed) at `[slot, slot + 30min]`.
2. Open **`new-task-sheet.tsx`** (new): a small sheet holding local state — **Title**
   (autofocus, required) + **Deadline/Duration** prefilled to the slot + 30 min and editable
   via the existing shared `DateFieldsSection`. No context/reminder/repeat here (set later by
   tapping the block) — keeps this minimal and avoids touching `TaskDetail`.
3. **Create** → `createTask({ title, dueAt: slot, durationMin })`; the real block replaces the
   ghost. **Cancel / empty title** → discard the ghost, nothing persisted.

The sheet reuses `TaskDetail`'s Modal chrome pattern (fade backdrop + Reanimated slide-up
sheet on mobile / centered card on web) but is its own component — no draft mode bolted onto
the live-patching `TaskDetail`.

## Files

- **New** `features/calendar/use-calendar-gestures.ts` — gesture composition + live-drag shared
  values + coordinate mapping wiring.
- **New** `features/calendar/calendar-overlay.tsx` — the drag overlay + snap-preview + ghost block.
- **New** `features/tasks/new-task-sheet.tsx` — the minimal ghost-create sheet.
- **Edit** `features/calendar/calendar-screen.tsx` — blocks become pressable (tap→open); mount
  the background create gesture + overlay; wire move/create/open callbacks.
- **Edit** `features/calendar/calendar-dates.ts` — add `yToMinutes` / `snapMinutes` / `xToDayIndex`.
- **Edit** `store/calendar.ts` — optimistic `moveBlock(id, dueAt)` (+ rollback) and a small
  `draft`/ghost slice; reuse `useTasksStore.patchTask` for persistence.
- Optional: add `expo-haptics` for the grab tick (guarded; skipped if unavailable).

## Edge cases

- Drag ends where it started (or <1 snap step moved) → treated as a tap (open), not a move.
- Snap clamps so a block never crosses midnight; a block dragged partly off-grid clamps into `[0,24h)`.
- Completed (done) blocks are draggable too; they keep their done styling.
- Two blocks landing on the same time is allowed (no collision logic — by prior decision).
- Web click vs drag: a movement threshold (~4px) distinguishes open (tap) from move (pan).
- Create sheet dismissed via backdrop = cancel (ghost discarded).

## Verification plan

- **Unit-ish**: `yToMinutes`/`snapMinutes`/`xToDayIndex` checked with a temp Neon-free script.
- **Service**: move = `patchTask { dueAt }` already covered by the tasks service; no new server logic.
- **Browser (web, this session)**: drag a block to a new time + day and confirm `due_at` in
  Neon; click an empty slot → create a titled task at that slot; click a block → detail opens.
- **Mobile**: long-press grab + drag, long-press empty → create, tap → open — verified on device
  by the user (this session can only drive web).
- Typecheck app + server clean.
```

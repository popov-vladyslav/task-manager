# Change Request 01 — Recurring tab, context management, UX fixes

Applies on top of tech_spec.md. On conflict, this document wins.

## Revision A — 2026-07-20 (overrides the sections below on conflict)

The plan was reshaped mid-flight. These deltas win over §1–§7:

- **Routines feature removed entirely.** Routine tab, screen, store, `/api/routines`,
  MCP `add_routine`, and the `get_today` routine section are all deleted; the
  `routines` + `routine_completions` tables are **dropped** (migration). The
  daily-routine use case is now served by a context excluded from All (below).
- **§2 Recurring tab — CANCELLED.** No separate Recurring tab, and no automatic
  `recurrence_id IS NOT NULL` hide-from-main rule. Recurring/repeated items are
  handled by putting them in a context that's excluded from All.
- **NEW: per-context "Exclude from All" flag.** A `contexts.exclude_from_all`
  boolean, toggled from Settings. When set, that context's tasks are hidden from the
  Tasks **All** view **and** the **Calendar**; they remain reachable only by selecting
  the context's own chip. One mechanism covers both "daily routine" and "repeated
  payments" contexts.
- **Settings = rightmost tab, not a header gear.** Tab bar becomes
  **Tasks · Calendar · Settings**. (Overrides the earlier header-gear decision.)
- **§7 Swipe actions — DROPPED** (deferred, not this pass).
- **Retained:** §3 login autofill, §4 bottom-sheet → `@gorhom/bottom-sheet`,
  §5 calendar defaults to Day, §6 hide empty contexts from the chip row.
- **Settings** (verbal ask) contains: context CRUD — create / rename / recolor /
  **exclude-from-All toggle** / delete-if-unused — plus **Sign out** and **Reset data**
  (keeps contexts + auth; wipes tasks/recurrence; routines no longer exist).

## Revision B — 2026-07-20 (task creation & interaction overhaul; on top of Revision A)

Inspired by the **Reminders** and **Focus To-Do** apps (examples only — do NOT clone; they
have far more than we need). **Mobile-first**; on **web** these fall back to a plain top input +
the existing detail modal (no soft-keyboard accessory row / swap-in panels).

1. **Quick-add.** A title-only text input at the **top of the task list**. Above the keyboard, an
   accessory row of shortcut icons — **Deadline, Reminder, Duration, Context**. Tapping a shortcut
   **dismisses the keyboard and slides up a same-height panel** (≈ keyboard height, approximate)
   to pick that value: date+time (Today / Tomorrow / +7d / Later chips + month grid), a context
   list, or a duration list. Duration is enabled only once a deadline is set. Then back to typing.
2. **Tap = quick-edit title, NOT open detail.** Tapping a task focuses its title for inline
   editing. While a row's title is focused, its **Play button becomes an (i) info icon** that opens
   the **full detail as a bottom sheet**. The detail is **regrouped** into sections (Date & time /
   Organization) over our existing fields (deadline, reminder, duration, context, recurrence,
   comments) — not the examples' extra fields (notes/URL/subtasks/tags/priority/place/images).
3. **Swipe-left → delete** a task (confirm/undo).
4. **Show / hide completed** — a collapsible "Completed" section at the bottom of the list (also
   within a context view).

Per-row gesture map: **tap** = edit title · **long-press** = reorder · **swipe-left** = delete ·
**Play** = timer · **(i)** = detail · **checkbox** = complete.
This **merges with §4** (@gorhom bottom sheet): the detail sheet IS the @gorhom migration + the regroup.
(Note: this restores a *delete-only* slice of §7, which Revision A had dropped.)

## 1. Context management via MCP

Add MCP tools (mirroring existing REST/service layer):
- `create_context` (label, color; slug auto-generated)
- `update_context` (rename, recolor)
- `delete_context` (only if no tasks reference it; otherwise return error listing task count)

Tasks can be grouped under a context as before. No changes to task→context relation.

## 2. Recurring tasks: separate tab, out of the main list

**Problem:** recurring instances (payments, document submissions, etc.) pollute the main Tasks list.

**Change:**
- Recurring task instances MUST NOT appear in the main Tasks list.
- Add a new tab **"Recurring"** to the bottom tab bar → tabs become: Tasks · Recurring · Routine · Calendar. (Web: new sidebar item.)
- The Recurring tab shows only instances of recurring tasks for the current period, grouped/sorted by due date.
- Recurring instances still appear in the **Calendar** (all modes) as before.
- Frequency of appearance = the recurrence rule chosen by the user (daily / weekly / monthly): exactly one visible instance per period.
- Completion behavior (example: mortgage payment): user taps complete → instance disappears from the Recurring tab immediately → next instance appears only when the next period's instance is spawned by the scheduler.
- At the bottom of the Recurring list: a toggle/collapsed section **"Show completed"** revealing completed instances of the current period.

**Assumption (confirm):** newly spawned recurring instances have `due_date` set by the rule, but `reminder` empty by default unless the rule template defines one.

## 3. Login screen: autofill support

The email input on the login screen must offer system autofill suggestions (iOS Keychain / password managers / email autocomplete):
- React Native: `textContentType="emailAddress"`, `autoComplete="email"`, `keyboardType="email-address"`, `autoCapitalize="none"`.
- Web: `<input type="email" autocomplete="email">`.
- Same treatment for the PIN field later: `textContentType="oneTimeCode"` for the magic-link code if applicable.

## 4. Bottom sheet: real sheet behavior + height fix

**Problems:**
1. The task detail "bottom sheet" is static — it must behave like a true bottom sheet: draggable up/down (drag handle), with snap points and swipe-down to dismiss.
2. Height bug: content is sometimes clipped — the sheet cannot scroll to the very bottom; the last fields are overlapped.

**Change:**
- Use `@gorhom/bottom-sheet` (standard for Expo/RN) with snap points (e.g. 60% / 92%) and pan gesture.
- Content inside must use the library's `BottomSheetScrollView` so scrolling reaches the end.
- Respect safe-area bottom inset and keyboard: `keyboardBehavior="interactive"`, `keyboardBlurBehavior="restore"`, bottom padding = safe area + tab bar height where applicable.
- Web keeps the centered modal (unchanged).

## 5. Calendar: default mode = Day

Calendar opens in **Day** view by default (currently Week/Month). Mode switcher unchanged; last-selected mode MAY be persisted in settings, but the initial default is Day.

## 6. Hide empty contexts on the main page

On the Tasks screen chip filter: a context with **zero open tasks** is hidden from the chip row. "All" chip always visible. Contexts remain fully visible/manageable in Settings regardless.

## 7. Swipe actions on task rows

Add swipe gestures on task list items (Tasks and Recurring tabs):
- **Swipe left** → reveal **Delete** (destructive red; with undo snackbar or confirm).
- **Swipe right** → reveal **Edit** (opens the task detail sheet).
- Use `react-native-gesture-handler` Swipeable (or ReanimatedSwipeable) consistent with the rest of the gesture setup.

**Assumption (confirm):** left = delete, right = edit. Flip if desired.

## Out of scope

No changes to: auth flow, timer, photos, routines logic, web modal behavior, DB schema beyond what §1–2 require (Recurring tab is a filtered view over existing tables; no new tables expected — only a `hide from main list` rule based on `recurrence_id IS NOT NULL`).

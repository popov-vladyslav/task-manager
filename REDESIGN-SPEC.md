# Log — Redesign Specification and Phased Plan

This document specifies the UI/UX redesign of the Log task manager (React Native / Expo, mobile-first, web supported) and the order in which to implement it.

Visual reference: the design canvas with all 13 artboards — https://claude.ai/artifact/R1F8nubkTqhiqhZBorNncY
Artboard names referenced below: `Main`, `Drawer`, `Context`, `ContextMenu`, `TaskDetails`, `PickerField`, `PickerDate`, `EditShort`, `Calendar`, `DragDialog`, `Countdown`, `Settings`, `Web`.

**Assumption warning.** This spec was written without repository access. Everything about the current schema, entity names and existing behaviour is inferred from screenshots, MCP behaviour and the issue tracker. Before starting each phase, verify these assumptions against the actual code. If an assumption is wrong, report the discrepancy and stop — do not bend the implementation to match this document.

---

## 1. Scope

**In scope:** new navigation (drawer, context page, "All" screen), a new minimal task card with inline editing, sections inside a context, a note/description field replacing comments, new semantics for recurring tasks in the calendar, a standalone countdown entity, cleanup of the settings screen, web adaptation.

**Out of scope:** search (deliberately postponed), tags, priorities, attachments, the multi-user migration (separate workstream), security hardening / pentest (a separate exercise **after** the redesign).

---

## 2. Data model changes

### 2.1 Sections inside a context

New table `sections`: `id`, `user_id`, `context_id` (FK, cascade delete), `name`, `position`, `created_at`.
`tasks` gains `section_id` (nullable FK to `sections`, `ON DELETE SET NULL`).

Key decision: **no default section row is created in the database.** A task with no section has `section_id = NULL` and is displayed under the first chip, labelled "Неопрацьоване" (a UI constant). This avoids a data migration for every existing task and keeps MCP calls that know nothing about sections working unchanged. Deleting a section moves its tasks to `NULL`; it never deletes tasks.

Ordering: `position` (integer, step 1000 for drag & drop), sorted by `position, created_at`.

### 2.2 Note replaces comments

`tasks` gains `note` (text, nullable). Comments are removed from the UI entirely.

What happens to existing comment rows is **an open decision** (section 6, decision A). Recommended approach: a migration that merges each task's comments into `note` in chronological order (format `— {date}: {text}`), keeping the comments table in the database as an archive but removing it from the API and MCP surface. Nothing is lost and the change stays reversible.

MCP impact: if comments leave the product, `add_comment` should be replaced by `append_note`. The "agent appends context to a task" use case is valuable and today it runs through comments.

### 2.3 Subtasks (new, optional)

Table `subtasks`: `id`, `task_id` (FK, cascade), `title`, `done` (bool), `position`, `created_at`. Rendered as a checklist with drag handles on the task card. Progress (`1/3`) is computed client-side.

This is the only genuinely new entity on the task card. If the first iteration needs to be smaller, this moves to the last phase or is dropped (see decision B).

### 2.4 Countdown (new standalone entity)

Table `countdowns`: `id`, `user_id`, `title`, `target_date` (date, no time), `color`, `pinned` (bool — drives the hero card at the top of the screen), `created_at`.

**No relation to `tasks` or `contexts`.** This is deliberate: countdown events are not tasks, are not filtered by context, and must not appear in task lists or the calendar.

Remaining days are computed client-side from "today" in the user's timezone. Whether countdowns need push reminders is an open decision (section 6, decision C).

### 2.5 Contexts: emoji

The drawer shows an emoji next to each context, so `contexts` needs an `emoji` field (text, nullable; fallback to the existing colour dot).

The `hidden` flag **already behaves as the design requires** — hidden contexts remain visible in the context list but their tasks are excluded from the "All" view. No behavioural change here; just keep it working.

Context creation moves into the drawer. Rename, colour, emoji, hide and delete live in the "…" menu on the context page. Reordering is drag & drop in the drawer (requires a `position` field on `contexts` if one does not already exist).

### 2.6 Recurring tasks in the calendar — the hard part

Today a task with a date, a duration and a recurrence rule behaves like a separate daily task that must be checked off. It must become **a visual time block projected forward over a horizon, with no per-day completion**, drawn as a dashed "ghost" block with the context colour hidden.

Implementation notes:

Virtual occurrences are generated from the recurrence rule over a rolling horizon (the tracker already refers to a 30-day rolling horizon) and are **not** materialised in the database. A ghost block has no checkbox — completion remains a property of the task itself, not of an individual day.

Dragging requires an exception model. New table `recurrence_overrides`: `id`, `task_id`, `occurrence_date`, `new_start` (nullable), `new_duration` (nullable), `cancelled` (bool).

- Drag answered with **"this occurrence only"** → insert a row in `recurrence_overrides`.
- Drag answered with **"this and all following"** → truncate the current rule (`until = occurrence_date - 1 day`) and create a **new task** carrying the new rule from that date. This is the standard Google Calendar split.

This is the riskiest part of the project and must not be bundled into another phase.

---

## 3. UI changes, screen by screen

**All tasks (`Main`).** Same shell as the context page: header (hamburger / title / "…"), an add-task row, then a flat task list. No "Today"/"Overdue" grouping — overdue items are identified by a red date with a clock icon. No date or task-count headings anywhere in the app.

**Drawer (`Drawer`).** "All", then a flat list of contexts with emoji and counts; hidden contexts are shown dimmed with a crossed-out eye icon; "New context" at the bottom plus a "+" next to the "Contexts" caption. **No sections in the drawer.** No search.

**Context page (`Context`, `ContextMenu`).** Header (hamburger / emoji + context name / "…"). Below it, section chips tinted with the context colour, swipeable, with a "+" chip to create a section. The add-task row states which section the task will land in. The "…" sheet contains: new section, manage sections, view switch (List / Board), sorting, rename & colour, hide context, delete context.

**Task card (`TaskDetails`, `PickerField`, `PickerDate`).** No field labels, no cards, no "Edit" button. Structure:
- header: back chevron, context picker (emoji + name + chevrons), "…";
- amber line: `Today, 18:00 · 30 min` plus a reminder icon when a reminder is set;
- muted line under it: the recurrence rule, e.g. `Weekly on Tue, until 15 Oct`;
- checkbox + large title;
- description text (plain, no container);
- checklist rows with drag handles and an empty row to add a subtask;
- bottom bar: icon group (description, subtask, reminder, delete) and a timer button showing tracked time.

Editing happens by tapping a value: the date line opens a sheet containing date, time, duration, reminder and recurrence together; the context header opens a popover with the context list and section chips.

**Quick create (`EditShort`).** A short bottom sheet: title plus chips (due date, reminder, context, recurrence). Swiping up opens the same task card — there is no separate full edit form anywhere in the app.

**Calendar (`Calendar`, `DragDialog`).** Solid blocks with a coloured left bar for timed events; dashed ghost blocks with no context colour for recurring tasks; a legend; a current-time line. Dragging a ghost block opens the scope dialog ("This occurrence only" / "This and all following").

**Countdown (`Countdown`).** Hero card for the nearest event plus a list of countdown cards, and an "Add event" row. No contexts anywhere on this screen.

**Settings (`Settings`).** Notifications, account, MCP token, updates, danger zone. **Contexts are not managed here at all** — they moved to the drawer and the context page.

**Web (`Web`).** Same structure at desktop width: persistent sidebar with contexts, context page with collapsible section groups and "New section", and a right-hand panel containing the same task card with the same inline editing.

---

## 4. API and MCP impact

New resources: `sections` (CRUD + reorder), `countdowns` (CRUD), `subtasks` (CRUD + reorder), `recurrence_overrides` (created on drag).

Changed resources: `tasks` gains `section_id` and `note`; `contexts` gains `emoji` and possibly `position`.

MCP tools: `create_task` / `update_task` must accept `section` (by name or id) and `note`; `add_comment` becomes `append_note` (depending on decision A); add `list_sections`.

**MCP must stay working at the end of every phase** — it is the owner's daily interface for creating tasks from chat sessions, not a nice-to-have.

Known tracker issues that block phase 4: `update_task` does not support changing recurrence, and `create_task` sometimes fails to apply recurrence on the first call. Fixing these is a **precondition** for the calendar work, not a side task.

---

## 5. Phased plan

Each phase ends in a releasable state behind a `newUI` feature flag.

**Phase 0 — Foundation.** Extract design tokens from the canvas (background `#0B0E13`, surfaces `#12171E` / `#161B22`, borders `#1F2630`–`#242B35`, text `#E9EEF4` / `#7A8492` / `#4E5865`, amber accent `#E9A23B`, context colours, system font with a monospace face for dates, slugs, counters and times) into a shared theme module. Build shared components: Header (hamburger/title/"…"), TaskRow, BottomSheet, Popover, Chip. Add the `newUI` feature flag.
*Done when:* existing screens still work and the new components render in a demo screen or storybook.

**Phase 1 — Navigation shell.** Drawer with contexts (emoji, counts, hidden contexts, create). "All" screen rebuilt as a context page. One header style across all screens. Remove the "Today"/"Overdue" smart lists and list groupings. Remove context management from Settings. Add a fourth tab "Countdown" as a placeholder.
*Done when:* the whole app is navigable in the new shell with no data changes.

**Phase 2 — Task card.** The new minimal card, inline pickers (date/time/duration/reminder/recurrence sheet; context/section popover), the `note` field, the comments migration, and the short create sheet that expands into the same card.
*Done when:* tapping a task never opens an edit form, and no comment content has been lost.

**Phase 3 — Sections.** Table, API, MCP support, section chips on the context page, the "…" menu, section management, moving tasks between sections.
*Done when:* sections can be created, reordered and deleted without losing tasks.

**Phase 4 — Calendar and recurrence.** Ghost blocks over the horizon, context colour hidden on recurring blocks, removal of per-day completion, `recurrence_overrides`, the scope dialog on drag, and rule splitting for "this and all following". Precondition: recurrence handling fixed in the API/MCP.
*Done when:* both drag outcomes behave predictably, verified against real recurring tasks in the production account.

**Phase 5 — Countdown.** Table, API, screen, hero card, create and edit flows.
*Done when:* the entity is fully independent of tasks and contexts.

**Phase 6 — Polish.** Subtasks (if kept), empty states, the Board view on the context page, web adaptation, removal of the old code paths behind the feature flag.
*Done when:* the `newUI` flag can be deleted.

**After phase 6:** the security/pentest exercise, run against the new code so the attack surface is only reviewed once.

---

## 6. Open decisions (needed before the relevant phase starts)

**A. Fate of existing comments.** Merge into `note` and retire the table (recommended), leave the table untouched and simply drop it from the UI, or delete outright? Determines whether MCP's `add_comment` becomes `append_note`.

**B. Subtasks.** Build them in this project (phase 6) or postpone? They add one table, one CRUD surface and drag & drop.

**C. Countdown reminders.** Push notification N days before an event, or is this a purely visual screen? A push requirement adds a scheduler dependency and makes phase 5 significantly larger.

**D. Ghost block horizon.** 30 days (as recorded in the tracker) or a different depth? And should ghost blocks appear in the month view, or only in day / 3-day / week views?

**E. Board view.** A real requirement or just drawn for completeness? If it will not be used, remove it from the "…" menu and from the plan.

---

## 7. Risks

**Phase 4 is the main risk.** Recurrence semantics touch the reminder scheduler, the calendar and MCP at once, and a mistake silently corrupts the owner's real personal schedule — he is the primary user of this app.

**MCP breakage.** Every phase must leave MCP functional; tasks are created through it daily.

**Timezone offset.** A known ~2-hour offset exists between times submitted through the API and times displayed in the app UI. The new task card shows time in three places (date line, sheet, calendar block), which will make this offset far more visible. Diagnose the root cause before phase 2 rather than compensating in the UI.

---

## 8. Verify in the repository before starting

1. Does `tasks` already have a description field? (Do not introduce a second one alongside `note`.)
2. How is recurrence implemented today — materialised occurrences or on-the-fly generation?
3. What migration tooling is used?
4. How does the reminder scheduler work, and is it aware of recurrence?
5. Does `contexts` already have an ordering field?
6. Confirm how `hidden` is applied in queries today (expected: hidden contexts excluded from "All", still listed in the context list).
7. Root cause of the ~2-hour API-to-UI time offset.

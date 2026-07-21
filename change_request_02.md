# Change Request 02 — Recurring without due date, hide-from-all + calendar rule, notifications polish

Applies on top of tech_spec.md and change_request_01.md. On conflict, this document wins.

## 1. Recurring tasks may have no due date

Currently recurring instances are expected to carry a `due_date`. That's too restrictive: many recurring items ("weekly review", "monthly close books") should reappear on schedule without needing a specific time on a calendar.

**Change:**
- `due_date` on a recurring task instance becomes **optional**.
- Instances still spawn according to the recurrence rule (daily / weekly / monthly) — the scheduler runs the same way, based on the rule's schedule date, not on `due_date`.
- **Appearance timing:**
  - Daily rule → new instance appears at the start of a new day (00:05 Europe/Warsaw, same scheduler run as today).
  - Weekly rule → at the start of the recurrence's chosen weekday.
  - Monthly rule → at the start of the recurrence's chosen day of month (or day 1 if not specified).
- Instances without `due_date` show up in the **Recurring tab** and in their **context view**, but NOT in the **Calendar** (calendar shows only tasks with a due_date).
- If the user adds a `due_date` to a recurring instance (or the rule template has one) → it also appears in the Calendar as before.

**Assumption (confirm):** the recurrence rule template can optionally define a default `due_time` (e.g. "always 09:00") that is copied onto each spawned instance's due_date. If the template doesn't define one, instances are spawned without due_date.

## 2. `hide_from_all` = hide from All view only, never from context or calendar

Contexts already have an `exclude_from_all` flag (per existing MCP `update_context` tool). Lock in the semantics unambiguously so nothing regresses.

**Rule:**
- A task belonging to a context where `hide_from_all = true`:
  - MUST NOT appear on the **All** filter of the Tasks screen.
  - MUST appear normally when the user filters by that specific context.
  - MUST appear on the **Calendar** if — and only if — the task has a `due_date`. The `hide_from_all` flag never suppresses calendar visibility.
  - Same rule applies to the **Recurring tab**: recurring instances of a hidden context still show in Recurring; they just don't leak into All.

**Rationale:** the flag is about decluttering the main list ("payments, subscriptions, admin — I know they're there, don't put them in my face daily"), not about hiding the task from the user entirely.

Update the settings UI copy for the toggle so the intent is clear:
> "Hide from All view — items still show in this context and on the calendar (if they have a due date)."

## 3. Push notifications: polish

Three separate items.

### 3a. Notification title composition

Do NOT include the app name in the title — iOS and Android render the app name and icon in the notification header automatically. Duplicating it wastes space.

Title is composed from the task's context and due_date, following this rule:

| Context | Due date | Title format |
|---|---|---|
| yes | yes | `{color_emoji} {context_name} · {relative_time}` |
| yes | no  | `{color_emoji} {context_name}` |
| no  | yes | `{relative_time}` |
| no  | no  | `Task` |

Body is always the task title (plain, no time or metadata appended).

**Special cases:**
- If the notification is a "new recurring instance spawned" (not a reminder), replace `{relative_time}` with the literal word `new`:
  - `🟠 Zalando · new`
  - Applies whether or not `due_date` is set.
- If `due_date` is in the past, `{relative_time}` becomes `overdue` (no "by X hours" — keep it short).

**Relative time format:**
- `now` — within ±5 min of current time
- `in 15 min`, `in 45 min` — < 1 hour
- `in 2 h`, `in 5 h` — < 24 hours
- `in 2 d`, `in 3 d` — ≥ 24 hours
- `overdue` — due_date is in the past

**Color emoji:** filled circle matching the context color. Contexts are user-editable, so read the color from the `contexts` table and pick the nearest emoji from this fixed palette:
`🔵 🟢 🟠 🔴 🟣 🟡 ⚪ ⚫ 🟤`

Nearest-color mapping should be done once at composition time (simple RGB distance is fine).

**Examples:**
- `🔵 Zoolatech · in 30 min` / `Standup with team`
- `🟠 Zalando · now` / `Write 360 review for Paul`
- `🟢 Home · overdue` / `Buy milk`
- `🟠 Zalando · new` / `Weekly PDP review` (recurring spawn, has context, no due date)
- `in 15 min` / `Call Illia` (no context)
- `Task` / `Reminder` (no context, no due date — extreme fallback, rare)

**Implementation requirement:** extract this logic into a single pure function on the server:

```
composeNotificationTitle(task: Task, kind: 'reminder' | 'spawn'): string
```

with unit tests covering the 4×2 matrix (context yes/no × due_date yes/no × kind reminder/spawn), plus the `overdue` case. Do NOT inline this logic in the push-send code — the function must be testable in isolation.

### 3b. Notification importance / priority

Raise notification importance so pings are clearly delivered.

**Android:**
- Create a notification channel `tasks-default` with `importance = HIGH` (heads-up + sound).
- Optionally a second channel `tasks-critical` with `importance = MAX` for reminders the user has marked as important.
- Channels created on first launch via `expo-notifications` `setNotificationChannelAsync`.

**iOS:**
- Set `interruptionLevel = 'timeSensitive'` on the Expo/APNs payload for regular reminders. Time-sensitive notifications bypass Focus / DND when the user grants permission.
- `sound = 'default'` (or a custom bundled sound file if we ship one — see 3c).
- **True Critical Alerts** (bypass silent mode + DND unconditionally) require a special Apple entitlement that is reserved for safety-critical apps and hard to obtain. Do NOT try to enable this. Time-sensitive is the correct choice for a task manager.

### 3c. Custom notification sound (optional, do last)

If a custom sound is desired:
- Bundle a short `.caf` (iOS) and `.wav` or `.ogg` (Android) file under `assets/sounds/`.
- Reference it in the notification payload: `sound: 'ping.caf'` on iOS, `sound: 'ping'` on Android (name must match channel setup).
- Skip this if it complicates delivery — 3a and 3b are the priority.

## Out of scope

- No changes to auth, timer, photos, routines completion logic, web layout.
- No new database tables. Recurring rule template may need one optional column `default_due_time TIME NULL` to support §1 assumption — if adding it, note in the diff.
- No changes to MCP tool signatures, but MCP `create_task` / `update_task` must accept `due_date = null` for recurring tasks (may already work — verify).

## Implementation order (suggested)

1. §2 — cheapest, mostly copy + confirming existing filter logic. Verify with a test in each of: All view, context view, Calendar, Recurring tab.
2. §1 — schema tweak (nullable due_date on instances if not already, optional `default_due_time` on rule) + scheduler + UI to hide calendar entry when due_date is null.
3. §3a — extract `composeNotificationTitle` with unit tests, wire it into the push-send path. This is independent of 3b and should land as its own PR.
4. §3b — notification channel + interruption level config change, one round of testing on a real device.
5. §3c only if the above lands cleanly.

For each item, before writing code, output a short diff summary of the intended change and wait for approval.

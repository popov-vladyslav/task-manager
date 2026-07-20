# Project Status — Task Manager "Log"

Handoff / resume doc. Source of truth for architecture & contracts is `tech_spec.md`;
deploy details in `DEPLOY.md`. Last updated: 2026-07-20.

## TL;DR
- **Phase 1** (Expo app + REST API) — ✅ done & deployed.
- **Phase 2** — MCP (9 tools) ✅, OAuth ✅, Scheduler ✅, Routines screen ✅ — all committed & deployed.
- **Phase 3** — **Timer ✅**, **Push ✅** (verified on iPhone), **Calendar ✅**.
  Calendar/UX refinement pass **✅ done** — Batches **A, B, C, D** all committed & verified (see "Calendar refinement pass" below). **Photos descoped.**
- **Change Request 01 + Settings** — 🚧 IN PROGRESS (started 2026-07-20). See "**Change Request 01 + Settings**" section below for the live batch ledger. (Old tech_spec §12 Settings — PIN / export / repeat-toggle — **dropped**; not wanted.)
- Prod auto-deploys from `main` (Render). Local `.env` `DATABASE_URL` = the **same Neon DB as prod**.

## Live infra
| Thing | URL / value |
|-------|-------------|
| API (log-api) | `https://log-api-rdmc.onrender.com` |
| Web (log-web) | `https://log-web-6tzk.onrender.com` |
| MCP connector | `https://log-api-rdmc.onrender.com/mcp` (added in Claude **web**; verified from chat) |
| DB | Neon project `task-manager` (`bold-glade-15135838`), db `neondb` — shared local + prod |
| CI/CD | push `main` → Render auto-deploys log-api + log-web; GitHub Actions `.github/workflows/ci.yml` (typecheck + web build) |

Render blueprint = `render.yaml` (log-api Node service + log-web static). `MCP_TOKEN` &
`JWT_SECRET` auto-generated on Render; `PUBLIC_URL` auto-derives from `RENDER_EXTERNAL_URL`.
Adding a custom connector is **web/desktop only** (mobile app has no "add connector" UI).

## Repo (npm-workspaces monorepo)
- `server/` — Express API + Drizzle/Neon + MCP server + OAuth + scheduler.
- `app/` — Expo Router (iOS + web from one codebase). EAS project `@vladyslavpopovpl/task-manager`.
- `packages/shared/` — TS types + design tokens.
- `design/` — imported Claude Design bundles (reference).

## Done
### Phase 1
- Full DB schema + migrations (`server/drizzle/0000_init.sql`, `0001_oauth.sql`), 5 contexts seeded.
- REST API over a shared service layer: contexts, tasks CRUD, fractional-index reorder, complete-logic, recurrence, comments. Magic-link + JWT auth.
- Expo app: Tasks screen; responsive context chips (mobile) ↔ sidebar (web); task detail as bottom-sheet (mobile) / centered modal (web) with **deadline/reminder pickers**, **recurrence editing**, **comments**; **drag-to-reorder** via `react-native-reorderable-list`.
- Deploy: `render.yaml`, CI, `DEPLOY.md`.

### Phase 2 (all committed & deployed)
- **MCP server** (`server/src/mcp/`, `routes/mcp.ts`): `POST /mcp` Streamable HTTP, **9 thick tools** — `list_contexts, list_tasks, get_today, create_task, update_task, complete_task, delete_task, add_comment, add_routine` (+ `start_timer`/`stop_timer` from Phase 3 → 11 total). `get_today` includes routine + running-timer sections.
- **OAuth 2.1** (`server/src/mcp/oauth.ts`): DCR, PKCE, owner-gated approval page, stateless JWT access/refresh. Static `Bearer MCP_TOKEN` bypass for dev clients.
- **Scheduler** (`scheduler.ts`, `services/recurring.ts`, `services/push.ts`, `routes/push.ts`): node-cron — spawn-recurring (daily 00:05 Warsaw), send-reminders (every min), repeat-reminders (every 15 min, opt-in). Expo Push sender; `notification_log` dedup. **Hardened**: `pool.on('error')` + `process.on('unhandledRejection')` so a transient Neon blip logs instead of crashing.
- **Routines screen** (`d7ee857`): `routines`/`routine_completions` in Drizzle schema; `services/routines.ts` + `routes/routines.ts` (GET/POST/PATCH/toggle + a `DELETE`); `RoutinesScreen` (daily checklist, progress bar, inline add, long-press→delete). **Navigation migrated** to Expo Router headless tabs (`expo-router/ui`): `app/(tabs)/` group, shared chrome in `features/nav/nav-chrome.tsx`, auth redirect guard in `(tabs)/_layout.tsx`. Screens persist across tab switches.

### Phase 3
- **Timer** (committed) — a **full-screen focus timer** (NOT the persistent bar the spec/design brief describe). Tap Play on a task → black full-screen, big thin MM/SS digits, pause/resume + close(×); `expo-keep-awake`. `time_entries` in schema; `services/timer.ts` + `routes/timer.ts`: `POST /start` **auto-switches** (stops any running one — deviates from spec §API 409, per the Play-button UX), `POST /stop`, `GET /` (returns active + **reconciles** stale orphans, capping a >8h run at 8h). MCP `start_timer`/`stop_timer`. App `store/timer.ts` (pause = ends the entry + resume starts a new one, so the Calendar records real worked periods), `features/timer/timer-screen.tsx` (AppState background→pause; adopts a running timer on load). **Verified end-to-end** (Neon + real browser).
- **Push delivery** ✅ **verified on a real iPhone (2026-07-17)** via an EAS ad-hoc `preview` build. EAS/Apple setup: personal team `943M674X2C`, ASC API key at `secrets/asc-api-key.p8` (git-ignored). APNs push key was created in the web portal + uploaded via the EAS dashboard (the ASC key can't create push keys). App only shows reminders when **backgrounded/locked** (no foreground `setNotificationHandler` yet — optional add).
- **Calendar v1** (committed) — `GET /api/calendar?from=&to=` (`services/calendar.ts`, `routes/calendar.ts`) + `store/calendar.ts` + `features/calendar/` (`calendar-dates.ts`, `calendar-screen.tsx`) + `(tabs)/calendar.tsx`. 4 modes (Day/3-day/Week/Month), timeline hour grid, context-colored event blocks, rose now-line, Month dot-grid (tap day → Day), prev/next/Today nav. Calendar is a real tab now. **Reworked by Batch C** (see below): now renders task **deadline+duration** blocks (NOT `time_entries`, NOT the abandoned `start_at`/`end_at` idea).

## Calendar/UX refinement pass — ✅ done (Batches A–D, 2026-07-17)
User feedback split into batches, all committed & verified.

- **Batch A** — #1 web task list scrolls (react-native-reorderable-list didn't bound on web → **absolute-fill** `style` on the ScrollView; same trick on the calendar timeline ScrollView). #2 calendar is **24h** (`HOUR_START=0`/`HOUR_END=24`), scrollable, auto-scrolls to current hour. #10 removed the grip icon; **drag-to-reorder on card long-press**. #11 sheet **backdrop fades** (Modal `animationType="fade"` + Reanimated `SlideInDown`).
- **Batch B + C — task deadline+duration model** (#5–9). **The `start_at`/`end_at` idea was built then reverted** in favour of: **`due_at` is a date+time deadline that doubles as the calendar block start**, plus a nullable **`duration_min`** (default 30; a task with a deadline always has one). Migration `0002_task_duration.sql` (drops start/end, adds `duration_min`). Calendar (`services/calendar.ts`) renders task blocks `[due_at, due_at+duration]` — **no `time_entries`** (timer is focus-only, decoupled) — and **includes done tasks** (rendered dimmed + strikethrough). Detail form: Deadline is now date+time (like Reminder); a **Duration** chip row (15/30/45/60/90/120m) shows when a deadline is set. MCP `create/update_task` gained `duration_min`. Verified: Neon service-layer (10/10) + real browser.
- **Batch D — calendar interactions** (#3, #4) — direct manipulation on the timeline (spec/plan in `docs/superpowers/{specs,plans}/2026-07-17-calendar-interactions.*`): **tap** block → detail; **drag** block → reschedule (cross-day, snap 15m, optimistic `PATCH {dueAt}`, keeps duration); **press empty slot** → dashed ghost + minimal `NewTaskSheet` (title + deadline/duration, saved on confirm); **haptic** tick on grab/long-press-create (mobile). Web = click-drag / click-create; mobile = long-press-grab / long-press-create. Month view unchanged. **Edge-resize deliberately deferred.** New files: `use-calendar-gestures.ts`, `calendar-overlay.tsx`, `new-task-sheet.tsx`; `GET /api/tasks/:id` added for tap-to-open. Verified on web (drag/create/tap + all modes); mobile verified by user.
  - **Gotcha (fixed):** RNGH workletizes gesture callbacks on native, so a captured `Date` crashed the device (`[Worklets] Cannot copy value of type Date`). Fix: all timeline gestures use **`.runOnJS(true)`** (handlers are JS-only: setState/store) — no worklet serialization. No-op on web.

## Pre-Settings polish — ✅ done (2026-07-18, 7 items)
- **#1 Overlapping calendar blocks** split the column into side-by-side lanes (`calendar-layout.ts`, lane-packing) instead of stacking.
- **#2/#3 Task create + title** — the inline "+ Task" add now opens the new task's detail with the title focused (routines unchanged); the detail title is `multiline` so long titles wrap.
- **#4 Month view** shows up to 3 context-colored **event bars** (truncated titles, chronological) + `+N` overflow, instead of dots.
- **#5 Timer** — one `adjustsFontSizeToFit` `MM:SS` line with a colon (kept the gray thin digits), centered, moderate size; **timer-only landscape** via `expo-screen-orientation` (app allows all orientations, root locks portrait, timer unlocks/relocks).
- **#6 Rich notifications** — reminders carry snooze action buttons (10m/30m/1h), **time-sensitive** priority, and a **blocking in-app modal** when foregrounded (`features/reminders/`, native-only `NotificationBridge`). Snooze reschedules server-side: `POST /api/tasks/:id/snooze {minutes}` sets `remind_at = now+minutes` and clears `notification_log` so the scheduler re-fires. iOS time-sensitive entitlement added.
- **#7 Keyboard** no longer covers inputs — `KeyboardAvoidingView` moved to wrap each modal (so the bottom-anchored sheet lifts) + the tasks/routines mobile roots + the auth card.
- **⚠️ Needs a dev-client rebuild** to test on device: `expo-screen-orientation` (#5), notification category + entitlement (#6), and the earlier `expo-haptics`. `#7` works after a JS reload but is best confirmed post-rebuild.

## Change Request 01 + Settings — 🚧 IN PROGRESS (started 2026-07-20)
Source: `change_request_01.md` (**wins on conflict** with tech_spec) + a verbal Settings ask
(context CRUD / sign out / reset). **This is the resume ledger — tick the boxes as batches land.**

### Confirmed decisions (do NOT undo without asking) — see `change_request_01.md` Revision A
- **Delete context = BLOCK when referenced.** If any task points at it → 409 with the task count. Identical in Settings UI and MCP `delete_context`. (CR §1.)
- **Reset data = keep contexts + settings + auth; user STAYS signed in.** Wipes tasks/comments/time_entries/recurrence_rules/notification_log. (Routines no longer exist — see below.)
- **🔄 Revision A (2026-07-20) — plan reshaped:**
  - **Routines REMOVED entirely** — tab/screen/store, `/api/routines`, MCP `add_routine`, `get_today` routine section; **`routines` + `routine_completions` tables DROPPED** (migration).
  - **Recurring tab (CR §2) CANCELLED** — no separate tab, no auto `recurrence_id` hide rule.
  - **NEW: `contexts.exclude_from_all` flag** — toggled in Settings. Hides that context's tasks from the Tasks **All** view **and** the **Calendar**; reachable only via the context's own chip. Serves both "daily routine" and "repeated payments" use cases.
  - **Settings = rightmost TAB**, not a header gear. Tab bar → **Tasks · Calendar · Settings** (remove the 3 gears added in B2).
  - **Swipe actions (CR §7) DROPPED.**
  - **Bottom sheet = full `@gorhom/bottom-sheet` migration** (snap 60/92, swipe-dismiss, `BottomSheetScrollView`); web modal unchanged. (CR §4, kept.)
- **🔄 Revision B (2026-07-20) — task creation & interaction overhaul** (Reminders / Focus To-Do as *examples*, not clones; see `change_request_01.md` Revision B):
  - **Mobile-first; web falls back** to a plain top input + existing detail modal (no accessory row / swap-in panels).
  - **Quick-add:** title-only input at the top of the list; keyboard-accessory shortcut row (**Deadline · Reminder · Duration · Context**); tapping a shortcut dismisses the keyboard and slides up an **≈keyboard-height panel** (approximate) to pick the value (date+time w/ Today/Tomorrow/+7d/Later chips + month grid; context list; duration list). Duration enabled only once a deadline is set.
  - **Tap = inline title edit, NOT open detail.** While a row's title is focused, its **Play button → (i) info icon** which opens the **detail bottom sheet** (regrouped: Date & time / Organization, over our existing fields).
  - **Swipe-left = delete** (restores a delete-only slice of the dropped §7).
  - **Show/hide completed** — collapsible "Completed" section at the bottom of the list (+ within a context).
  - Per-row gestures: tap=edit · long-press=reorder · swipe-left=delete · Play=timer · (i)=detail · checkbox=complete.
  - **Sequencing:** B3 → B4 → B5 → **[B6 = @gorhom sheet + this overhaul]** → polish.

### Assumptions (proceeding unless corrected)
- Calendar: default mode = **Day**; last-selected mode persisted locally. (CR §5.)
- Hide-empty-contexts: a context with **zero non-done tasks** hides from the Tasks chip row; "All" always shown; Settings lists all contexts. (CR §6 — retained; awaiting final ack.)

### Batches (each ends with typecheck + verify + commit)
> B1 & B2 landed BEFORE Revision A. B2's header-gear nav is **superseded** by B4 (gear→tab); B2's Settings screen gains the exclude toggle in B5. B1's reset still lists `routines` in its TRUNCATE — **B3 removes that** when it drops the tables.
- [x] **B1 — Context backend + MCP + Reset backend** (all server + shared api; no UI) — ✅ done & verified 2026-07-20 (uncommitted)
  - [x] `deleteContext(id)` — 409 + task count if referenced, else delete (`services/contexts.ts`)
  - [x] slug-uniqueness in `createContext` (`uniqueSlug`, suffix `-2`/`-3`… ; slug stable on rename)
  - [x] `DELETE /api/contexts/:id` route
  - [x] `resetData()` (`services/data.ts`: `TRUNCATE tasks, recurrence_rules, routines … CASCADE`) + `DELETE /api/data {confirm:'RESET'}` (`routes/data.ts`), mounted in `index.ts`
  - [x] MCP tools `create_context` / `update_context` / `delete_context` (`build-server.ts`; delete catches the 409 → friendly text)
  - [x] app api client: `createContext` / `updateContext` / `deleteContext` / `resetData` (`app/src/lib/api.ts`)
  - [x] verified: both workspaces typecheck clean; reset SQL + context service run against an isolated Neon branch (`br-crimson-rain-ascmov06`, auto-expires 2026-07-21) — reset kept contexts/push/auth & wiped content via cascade; uniqueSlug/rename-keeps-slug/delete-block-with-count/delete-after-unref all PASS; prod DB confirmed untouched.
- [x] **B2 — Settings screen (UI)** — ✅ done & verified 2026-07-20 (uncommitted)
  - [x] gear entry points: `SettingsGearButton` in the 3 mobile headers (Tasks/Routine/Calendar) + a Settings link in the web `SideNavLinks` (`nav-chrome.tsx`); stacked route `app/settings.tsx` → `features/settings/settings-screen.tsx`
  - [x] Settings screen: **Contexts** (list / add / rename / recolor via 10-swatch palette / remove with 2-step confirm; inline editor), **Account** (Sign out → `router.replace('/sign-in')`), **Danger** (Reset data, expanding double-confirm)
  - [x] context CRUD + `resetData` actions in the tasks store (mutate local `contexts`; clear `activeContextId` if deleted; reload after reset — routines store reloaded from the screen)
  - [x] deep-link/refresh guard: Settings loads contexts itself if the store is empty
  - [x] verified in real browser (web): screen renders on-brand; create (`qa-b2-temp`) → editor+palette → 2-step delete all work; Sign out → `/sign-in`; prod contexts self-cleaned back to 5. (Reset "Delete everything" not clicked live — proven on the Neon branch in B1; delete-block 409 proven by B1 service test.)
  - ⚠️ **Not yet checked on a mobile device**: the three mobile-header gears + `/settings` push nav (verified on web only).
- [~] **B3 — Remove Routines entirely (Revision A)** — code ✅ done & verified 2026-07-20 (uncommitted); **prod migration NOT yet applied (awaiting go-ahead)**
  - [x] app: deleted Routine tab (nav-chrome bottom+side, `(tabs)/_layout` TabTrigger), `(tabs)/routines.tsx`, `features/routines/`, `store/routines.ts`; removed routines reload from Settings reset; router types regenerated (no `/routines`)
  - [x] server: removed `routes/routines.ts` + mount, `services/routines.ts`, MCP `add_routine`, `get_today` routine section; app api client routine methods; `Routine`/`CreateRoutineInput`/`UpdateRoutineInput` shared types; `toRoutine` mapper; `routines`/`routineCompletions` drizzle tables (+ unused `primaryKey` import)
  - [x] reset: dropped `routines` from the `resetData()` TRUNCATE (`services/data.ts`)
  - [x] migration `server/drizzle/0003_drop_routines.sql` → `DROP TABLE IF EXISTS routine_completions; DROP TABLE IF EXISTS routines;`
  - [x] verified: both workspaces typecheck clean; migration + updated reset SQL run on Neon branch `br-restless-mouse-aszyk1yy` (auto-expires 2026-07-21) — tables dropped, rest of schema intact, reset works
  - [x] **PROD migration APPLIED** ✅ — B3 was pushed + deployed; Render `preDeployCommand` ran `db:migrate` and dropped `routines`/`routine_completions` on prod (confirmed 2026-07-20: a fresh branch off prod shows `0003` already in `_migrations`). Routines are gone from prod.
- [x] **B4 — Settings: header gear → rightmost tab (Revision A)** — ✅ done & verified 2026-07-20 (uncommitted)
  - [x] `settings` registered as a tab: `(tabs)/settings.tsx` + `<TabTrigger name="settings" href="/settings" />` in `(tabs)/_layout`; deleted the stacked `app/settings.tsx`
  - [x] nav-chrome: Settings (gear icon) added to `MobileTabBar` (last) + `SideNavLinks` (both as `TabTrigger`s); **removed `SettingsGearButton`** component + its use in Tasks/Calendar headers; reverted those header layout tweaks; dropped the now-unused `useRouter` import
  - [x] `SettingsScreen` made **responsive**: wide = LOG sidebar (`SideNavLinks` + Sign out) + main; mobile = LOG/date header (no back chevron) + sections. Kept the deep-link contexts load-guard
  - [x] verified in real browser — **web (wide):** Settings is a highlighted sidebar tab, screen shows its own sidebar (navigable), no header gears; **mobile (390px):** bottom bar = Tasks · Calendar · Settings, tapping Settings navigates, no header gear. Tabs = Tasks · Calendar · Settings (no Routine). App typecheck clean.
- [x] **B5 — Exclude-from-All context flag (Revision A)** — ✅ done & verified 2026-07-20 (uncommitted); **prod migration `0004` applies on next deploy**
  - [x] migration `0004_context_exclude.sql` → `contexts.exclude_from_all boolean NOT NULL DEFAULT false`; drizzle schema + `Context`/`Create`/`UpdateContextInput` types + `toContext` mapper
  - [x] service/API: `createSchema`/`updateSchema` + `createContext` carry `excludeFromAll` (`updateContext` passes it via `.set(patch)`); MCP `create_context`/`update_context` gained `exclude_from_all`
  - [x] Settings editor: **"Hide from All view"** `Switch` per context (+ create form); excluded rows show an `EyeOff` "hidden" badge
  - [x] Tasks: `excludedIds` set → `inAll()` filters the **All** view (activeContextId == null) and its `all` count; excluded context still shows as a chip and works when selected
  - [x] Calendar: `services/calendar.ts` left-joins contexts and filters out excluded-context tasks
  - [x] app api client + store `createContext`/`updateContext` pass `excludeFromAll`
  - [x] verified: both workspaces typecheck clean; service test on Neon branch `br-noisy-queen-as0gywtn` (migration applied there) — flag round-trips on create/update, calendar hides-then-shows on toggle (ALL PASS); real browser against a throwaway API on that branch — excluding "Home" dropped **All 39 → 24**, Home chip still shows count 15 and selecting it lists its tasks, Settings shows the "hidden" badge. Prod untouched.
- [ ] **B6 — Detail bottom sheet + Task-UX overhaul (CR §4 + Revision B)** — mobile-first; web keeps plain input + existing modal
  - [ ] **B6a — Detail sheet:** mobile task detail → `@gorhom/bottom-sheet` (snap 60/92, swipe-dismiss, `BottomSheetScrollView`, keyboard interactive, safe-area + tab padding); fix the clipping/last-field bug; **regroup fields** into Date & time / Organization sections; web centered modal unchanged
  - [ ] **B6b — Task row interactions:** tap = inline title edit (not open detail); Play → **(i)** while editing → opens detail sheet; **swipe-left = delete** (confirm/undo); keep long-press reorder + checkbox complete; **show/hide completed** collapsible section
  - [ ] **B6c — Quick-add:** title-only top input + keyboard-accessory shortcut row (Deadline · Reminder · Duration · Context); tapping a shortcut → dismiss keyboard, slide up ≈keyboard-height picker panel (date+time w/ quick chips + month grid; context list; duration list; duration needs a deadline); replaces the current "+ Task" button; web = plain input
  - [ ] verify device + web (each sub-batch)
- [ ] **B7 — Polish (CR §3, §5, §6)**
  - [ ] login email autofill (`textContentType`/`autoComplete`/`keyboardType`/`autoCapitalize`; web `type=email`)
  - [ ] calendar default Day + persist last-selected mode
  - [ ] hide empty contexts from the Tasks chip row
  - [ ] verify

## Left / next (after CR01)
1. Optional calendar polish: **edge-resize** blocks to change `duration_min` (deferred from Batch D); drag auto-scroll at viewport edges.
2. Optional: foreground notification handler; App Store publish via TestFlight (reuse the EAS/`production` profile; create App Store Connect app record + new personal-account ASC key if needed).

## Decisions / deviations (do NOT undo without asking)
- **priority out of scope** — removed from DB, API, UI (overrides tech_spec §2).
- **Photos descoped** — dropped entirely (was tech_spec §7/§11). `photos` table + `photosCount` remain as harmless dead code.
- Detail uses RN `Modal`, not `@gorhom/bottom-sheet` (installed, unused). Drag-to-reorder = `react-native-reorderable-list`.
- **Navigation = Expo Router headless tabs** (`expo-router/ui`), NOT `NativeTabs` — app needs custom cross-platform chrome (dark web sidebar + mobile bottom bar). `TabSlot` keeps screens mounted.
- **Timer = full-screen focus timer**, not the persistent bar. `start_timer` **auto-switches** (stops previous) instead of the spec's 409. **Pause = multi time_entry** (accurate worked time). Close ≠ complete the task.
- **Routines "delete" = hard `DELETE /api/routines/:id`** (beyond tech_spec §3).
- Web content column is **fluid full-width** (no maxWidth); sign-in card capped at 420, centered.
- **Calendar timeline = full 24h** grid, scrollable (not the design brief's 8:00–22:00).
- **No drag grip on task cards** — reorder is triggered by **long-pressing the card** (single-user app).
- **Sheet backdrop fades** (Modal `animationType="fade"`), sheet slides up via Reanimated — not the default full-slide.
- **Calendar reflects task `due_at`+`duration_min` blocks, NOT `time_entries`.** Timer is focus-only, off the calendar. `due_at` is the deadline AND the block start; `duration_min` (default 30) is the length. Reminder (`remind_at`) is notifications only and independent. Done tasks stay on the calendar (dimmed + strikethrough). Overlaps allowed — **no collision logic** (deliberately dropped as over-complex for a single-user app).
- **Timeline gestures must use RNGH `.runOnJS(true)`** — native workletizes gesture callbacks, so any captured `Date` crashes the device. Our handlers are JS-only, so run them on the JS thread.
- **On web, react-native ScrollView / reorderable list must be `position:absolute` filled** inside a `flex:1` parent to scroll (flex `min-height:0` alone doesn't work through the library's internals).
- MCP auth = OAuth (claude.ai) + static-token bypass. `PUBLIC_URL` = OAuth issuer, auto from `RENDER_EXTERNAL_URL`.

## Run locally
```bash
npm install
npm run db:migrate && npm run db:seed        # against Neon (DATABASE_URL in root .env)
npm run server                                # API on :4000 (also starts the scheduler)
npm --workspace app run web                   # Expo web on :8081
# iOS dev build (native modules not in Expo Go): npx expo run:ios
```
Auth in dev: no Resend key → magic-link URL printed to the API console. To sign in on a device
build without email: mint a token (`randomToken()` → insert `hashToken` into `auth_tokens` kind
`magic`, 15-min TTL) and paste it into the app's "Paste sign-in token" field.

## Caveats / notes
- **Push delivery works** (verified on device). iOS reminders show when backgrounded/locked.
- Local `.env` `DATABASE_URL` is the **same Neon DB as prod** → `push_tokens`/`notification_log`/tasks are all queryable locally.
- IDE sometimes shows false-positive TS errors in `app/`; trust `npm --workspace {app,server} run typecheck` (both clean).
- `.DS_Store` is tracked (macOS junk from an old commit) — worth `git rm --cached` + gitignore someday.

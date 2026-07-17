# Project Status — Task Manager "Log"

Handoff / resume doc. Source of truth for architecture & contracts is `tech_spec.md`;
deploy details in `DEPLOY.md`. Last updated: 2026-07-17.

## TL;DR
- **Phase 1** (Expo app + REST API) — ✅ done & deployed.
- **Phase 2** — MCP (9 tools) ✅, OAuth ✅, Scheduler ✅, Routines screen ✅ — all committed & deployed.
- **Phase 3** — **Timer ✅**, **Push ✅** (verified on iPhone), **Calendar ✅**.
  Calendar/UX refinement pass **✅ done** — Batches **A, B, C, D** all committed & verified (see "Calendar refinement pass" below). **Next: Settings.** **Photos descoped.**
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

## Left / next (in order)
1. **Settings** (Phase 3 §12) — PIN (6-digit bcrypt in `settings`), repeat-reminders toggle, JSON export (`GET /api/export`), data reset (`DELETE /api/data {confirm:'RESET'}`).
2. Optional calendar polish: **edge-resize** blocks to change `duration_min` (deferred from Batch D); drag auto-scroll at viewport edges.
3. Optional: foreground notification handler; App Store publish via TestFlight (reuse the EAS/`production` profile; create App Store Connect app record + new personal-account ASC key if needed).

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

# Task Manager "Log" — Technical Specification

Стек: Expo (React Native, mobile + web) · Node.js/Express на Render.com (paid) · Neon Postgres · Expo Push (APNs) · Cloudflare R2 (фото)

Один користувач. Основний канал вводу — чат Claude (через MCP). Застосунок — перегляд, виконання, планування.

---

## 1. Архітектура

```
┌─────────────────────┐      ┌──────────────────────────────┐
│  Expo app            │      │  Render.com (один сервіс)     │
│  iOS + Web (RN Web)  │◄────►│  ├─ REST API  /api/*  (JWT)   │
└─────────────────────┘      │  ├─ MCP server /mcp (Bearer)  │
                              │  ├─ Scheduler (node-cron)     │
┌─────────────────────┐      │  └─ Push sender (Expo Push)   │
│  claude.ai / app     │◄────►│                               │
│  (custom connector)  │      └───────────┬──────────────────┘
└─────────────────────┘                  │
                              ┌──────────▼─────────┐  ┌─────────────┐
                              │  Neon Postgres      │  │ Cloudflare R2│
                              └────────────────────┘  └─────────────┘
```

REST і MCP — тонкі шари над спільним service layer (`services/tasks.ts` тощо). Жодної бізнес-логіки в роутерах/tools напряму.

---

## 2. Схема БД (Neon Postgres)

```sql
-- Контексти редаговані з drawer / меню контексту, не enum
CREATE TABLE contexts (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,          -- 'work', 'home'
  label       text NOT NULL,
  color       text NOT NULL,                 -- '#5B8DEF'
  sort_order  int  NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false,
  exclude_from_all boolean NOT NULL DEFAULT false, -- 0004: hidden from "All"
  emoji       text,                             -- 0013: nullable; fallback derived from color
  sections_enabled boolean NOT NULL DEFAULT false -- 0018: show section chips on this category
);

CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  context_id    int REFERENCES contexts(id),
  priority      text CHECK (priority IN ('high','medium','low')) DEFAULT 'medium',
  status        text CHECK (status IN ('active','waiting','done')) DEFAULT 'active',
  due_at        timestamptz,
  remind_at     timestamptz,
  sort_global   real NOT NULL DEFAULT 0,     -- fractional indexing для reorder
  sort_context  real NOT NULL DEFAULT 0,
  recurrence_id uuid REFERENCES recurrence_rules(id),  -- інстанс якого правила
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_via   text CHECK (created_via IN ('app','mcp')) DEFAULT 'app',
  note          text,                        -- 0014: nullable; replaces comments (ADR 0006)
  section_id    uuid REFERENCES sections(id) ON DELETE SET NULL, -- 0017: NULL = "Unsorted"
  sort_section  real NOT NULL DEFAULT 0      -- 0017: fractional order inside a section
);
CREATE INDEX idx_tasks_open ON tasks (status, context_id) WHERE status != 'done';

-- 0017 (ADR 0008): sections inside a category. No default row — tasks with
-- section_id NULL are the "Unsorted" chip. Names unique per context (service-enforced).
CREATE TABLE sections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_id integer NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort       real NOT NULL DEFAULT 0,        -- fractional indexing (lib/frac-index.ts)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sections_context ON sections (context_id, sort);

-- 0015 (ADR 0007): checklist items owned by a task. No dates, reminders,
-- timers or contexts — never listed as tasks anywhere.
CREATE TABLE subtasks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subtasks_task ON subtasks (task_id, sort_order);

CREATE TABLE recurrence_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,               -- шаблон назви: 'Іпотека — {month}'
  context_id    int REFERENCES contexts(id),
  priority      text DEFAULT 'medium',
  rule          text NOT NULL,               -- 'monthly:1' | 'monthly:20' | 'weekly:mon' | 'daily'
  remind_time   time,                        -- '10:00'
  due_offset_d  int DEFAULT 0,               -- дедлайн = дата генерації + offset днів
  active        boolean NOT NULL DEFAULT true,
  last_spawned  date                         -- захист від дублів
);

-- comments: replaced by tasks.note (ADR 0006); the table is dropped by a later contracting migration (0016) after the comment-free code is verified on prod

-- DESCOPED (see STATUS.md): photos were never implemented; the table was dropped
-- in migration 0008 and `photosCount` removed from the Task contract.
CREATE TABLE photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  r2_key     text NOT NULL,                  -- ключ в R2, URL підписується на льоту
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE routines (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  time_hint  time,                           -- орієнтовний час, не тригер
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE routine_completions (
  routine_id int  REFERENCES routines(id) ON DELETE CASCADE,
  day        date NOT NULL,
  done_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (routine_id, day)
);

CREATE TABLE time_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz                     -- NULL = таймер активний
);
-- Гарантія "одна активна задача за раз":
CREATE UNIQUE INDEX one_running_timer ON time_entries ((true)) WHERE ended_at IS NULL;

CREATE TABLE notification_log (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id  uuid REFERENCES tasks(id) ON DELETE CASCADE,
  kind     text CHECK (kind IN ('initial','repeat')),
  sent_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
  token      text PRIMARY KEY,               -- ExponentPushToken[...]
  device     text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key   text PRIMARY KEY,                    -- 'repeat_reminders', 'repeat_after_h'
  value jsonb NOT NULL
);

CREATE TABLE auth_tokens (
  token_hash text PRIMARY KEY,               -- magic link / refresh, sha256
  kind       text CHECK (kind IN ('magic','refresh')),
  expires_at timestamptz NOT NULL
);
```

Нотатки:
- **Reorder**: fractional indexing (`sort = (prev + next) / 2`), періодичний rebalance. Drag в "All" оновлює `sort_global`; drag всередині контексту — `sort_context`.
- **Циклічні**: у списку живе лише поточний інстанс (`tasks` з `recurrence_id`). Виконав → `status='done'`, наступний з'явиться, коли scheduler його згенерує у свій день. "next: 1 сер" рахується з `rule` на льоту.

---

## 3. REST API (для Expo-клієнта, JWT)

```
POST   /auth/magic-link        { email } → 200 (шле лист)
POST   /auth/verify            { token } → { jwt, refresh }
POST   /auth/pin               { pin }   → { jwt }        (PIN задається в Settings)
POST   /auth/refresh           { refresh } → { jwt }

GET    /api/contexts
POST   /api/contexts           { label, color, slug?, excludeFromAll?, emoji?, sectionsEnabled? }
PATCH  /api/contexts/:id       { label?, color?, archived?, excludeFromAll?, emoji? (nullable, один графем), sectionsEnabled? }
POST   /api/contexts/reorder   { ids: number[] } → повний список; чужі id пропускаються

GET    /api/tasks?context=&status=          (сортовано по sort_*)
POST   /api/tasks              { title, contextId?, dueAt?, remindAt?, durationMin?, recurrence?, note? }
PATCH  /api/tasks/:id          (будь-які поля вкл. note (nullable); { completed: true } → complete-логіка)
DELETE /api/tasks/:id
POST   /api/tasks/:id/reorder  { after_id?, before_id?, scope: 'global'|'context' }

# Sections (0017, ADR 0008). Порядок — fractional index (`sort`); імена унікальні в межах категорії (409).
GET    /api/contexts/:id/sections         → Section[]
POST   /api/contexts/:id/sections         { name } → 201 Section
GET    /api/sections                      → усі секції користувача
PATCH  /api/sections/:id                  { name } → Section
POST   /api/sections/:id/reorder          { afterId?, beforeId? } → Section
DELETE /api/sections/:id                  → 204; задачі секції переходять у першу (за sort) з решти секцій, або section_id = NULL якщо секцій не лишилось
# Задачі з section_id = NULL показуються у першій секції контексту. Увімкнення sections_enabled створює першу секцію, якщо жодної немає.
# Задачі: POST/PATCH /api/tasks приймають sectionId (має належати контексту задачі, інакше 400);
# зміна contextId без sectionId скидає секцію; reorder scope 'section' впорядковує sort_section.

# Subtasks (0015, ADR 0007). Кожен запис повертає батьківський Task з subtasks[] (відсортовані по sort_order).
POST   /api/tasks/:id/subtasks            { title } → 201 Task
PATCH  /api/tasks/:id/subtasks/:sid       { title?, done? } → Task
DELETE /api/tasks/:id/subtasks/:sid       → 200 Task
POST   /api/tasks/:id/subtasks/reorder    { ids: uuid[] } → Task; чужі/невідомі id пропускаються

GET    /api/settings           → { notificationsEnabled, language: 'en'|'uk'|'pl'|'ru'|null }
PATCH  /api/settings           { notificationsEnabled?, language? } → те саме; мова зберігається
                               в settings key `language` і використовується для push-заголовків
                               та ранкового підсумку (без мови → англійська)

POST   /api/tasks/:id/photos   → DESCOPED, never implemented (see STATUS.md)
DELETE /api/photos/:id         → DESCOPED, never implemented

GET    /api/routines
POST   /api/routines           { title, time_hint? }
PATCH  /api/routines/:id
POST   /api/routines/:id/toggle { day }                    (idempotent upsert/delete)

GET    /api/calendar?from=&to=              (time_entries + tasks з due_at у діапазоні)
POST   /api/timer/start        { task_id }  → 409 якщо вже є активний (з деталями)
POST   /api/timer/stop         → закриває активний, повертає entry

POST   /api/push/register      { token, device }
GET    /api/export             → повний JSON дамп
DELETE /api/data               { confirm: 'RESET' } → wipe всіх таблиць крім auth/settings
```

---

## 4. MCP server (для мене в claude.ai)

Endpoint: `POST /mcp` (Streamable HTTP), auth: `Authorization: Bearer <довгий статичний токен>` (env `MCP_TOKEN`, 32+ байти). Rate limit 60 req/min. Усі write-операції логуються.

Час у MCP: `due_at` / `remind_at` — ISO 8601; значення без зсуву трактується як локальний час
Europe/Warsaw (`2026-09-15T18:00`), зі зсувом або `Z` — як вказано. У відповідях усі часи
друкуються у Warsaw (`due 2026-09-15 18:00`). Реалізація: `server/src/lib/when.ts`.

Tools ("товсті", один виклик = повна дія):

```
create_task     { title, context?, due_at?, remind_at?, duration_min?,
                  recurrence? { freq, days?, day_of_month?, remind_time? }, note? }
                → створює задачу + правило (якщо recurrence) + нотатку
update_task     { id | title_match, title?, context?, due_at?, remind_at?,
                  duration_min?, status?, recurrence?, note? (null очищає) }
append_note     { id | title_match, text }       → дописує до note через порожній рядок
add_subtask     { id | title_match, title }      → чекліст-пункт; у відповідях під задачею
update_subtask  { subtask_id, title?, done? }      друкується `    [x] title [subtask_id]`
delete_subtask  { subtask_id }                     (ADR 0007; підзадачі — не задачі)
                                                -- title_match: пошук по назві, щоб
complete_task   { id | title_match }               я міг "закрий задачу про іпотеку"
delete_task     { id | title_match }
list_sections   { context }                       → рядок на секцію: `<name> [<id>]`
                                                  -- create_task / update_task приймають section
                                                  -- (ім'я або id у межах контексту; невідоме ім'я
                                                  -- створюється; null знімає секцію); у відповідях
                                                  -- задача друкує `    section: <name>`
list_tasks      { context?, status?, due_before?, overdue? }
get_today       {} → задачі на сьогодні + рутина + активний таймер
add_routine     { title, time_hint? }
start_timer     { task: id|title_match }
stop_timer      {}
list_contexts   {}                                → рядок на контекст: `<emoji> <slug> — <label> (<color>)`
create_context  { label, color (#RRGGBB), emoji?, exclude_from_all?, sections_enabled? }
update_context  { slug, label?, color?, emoji? (null очищає), exclude_from_all?, sections_enabled? }
delete_context  { slug }
```

`title_match`: fuzzy-пошук по відкритих задачах; якщо збігів > 1 — tool повертає кандидатів, я перепитаю тебе в чаті.

---

## 5. Scheduler (node-cron, всередині сервісу)

| Job | Розклад | Логіка |
|---|---|---|
| spawn-recurring | щодня 00:05 Europe/Warsaw | для кожного active rule: якщо сьогодні = день правила і last_spawned < сьогодні → створити інстанс, проставити due/remind, оновити last_spawned |
| send-reminders | кожну хвилину | tasks: remind_at <= now, status='active', немає 'initial' в notification_log → push + лог |
| repeat-reminders | кожні 15 хв | якщо settings.repeat_reminders: задачі з initial-пушем старшим за repeat_after_h, досі active, без repeat за останні repeat_after_h → повторний push |
| routine-reset | — не потрібен | completions прив'язані до `day`, "скидання" — це просто новий день |

Push: Expo Push API, батчами, з `data: { taskId }` для deep link. Таймзона всіх розрахунків — Europe/Warsaw.

---

## 6. Auth

- Юзер один — сідом у БД, реєстрації немає. Email захардкоджений в env (`OWNER_EMAIL`) — magic link шлеться тільки на нього.
- Magic link: токен 15 хв, одноразовий. Лист через Resend (безкоштовного тіру вистачить) або SMTP.
- PIN: 6 цифр, bcrypt-хеш у settings, до 5 спроб / 15 хв.
- JWT 30 днів + refresh 180 днів — щоб на своїх пристроях не перелогінюватись.
- MCP-токен — окремий від JWT, ротація вручну.

---

## 7. Фото

R2 bucket, доступ тільки через presigned URLs (PUT для аплоаду з застосунку, GET 1h для перегляду). Клієнт стискає до ~2000px/80% перед аплоадом (`expo-image-manipulator`). `DELETE /api/data` чистить і R2.

---

## 8. Expo-клієнт

- Expo SDK 54+, Expo Router, Zustand, Reanimated (drag-to-reorder), `@gorhom/bottom-sheet`, `expo-notifications`, `expo-image-picker`.
- Одна кодова база: bottom tabs (mobile) / sidebar (web) через responsive-обгортку layout'у; detail = bottom sheet (mobile) / modal (web).
- Оптимістичні апдейти для check/reorder/toggle; pull-to-refresh; поллінг або refetch on focus (реалтайм не потрібен — юзер один).
- Deep link з пушу → екран задачі.
- Deploy web: `expo export -p web` → Render static site. Mobile: EAS Update (як в Interview Tracker).

---

## 9. Порядок імплементації

**Фаза 1 — ядро (робочий MVP):**
1. Схема БД + міграції (drizzle або knex)
2. Service layer + REST: contexts, tasks CRUD, reorder, complete
3. Auth (magic link + JWT; PIN пізніше)
4. Expo: Tasks screen + detail sheet + add flow, web layout
5. Deploy: Render + Neon + web static

**Фаза 2 — те, заради чого все затівалось:**
6. MCP server + підключення конектора в claude.ai
7. Scheduler: recurring spawn + пуші + push_tokens
8. Routines screen

**Фаза 3 — добивка:**
9. Calendar (4 режими) + time_entries
10. Таймер + timer bar
11. Фото (R2), коментарі UI
12. Settings: PIN, repeat-reminders, export, reset

Кожна фаза закінчується деплоєм — після фази 1 застосунком уже можна користуватись руками, після фази 2 — через чат.

---

## 10. Env checklist (Render)

```
DATABASE_URL=            # Neon
JWT_SECRET=
MCP_TOKEN=               # openssl rand -hex 32
OWNER_EMAIL=
RESEND_API_KEY=          # або SMTP_*
R2_ACCOUNT_ID= R2_ACCESS_KEY= R2_SECRET= R2_BUCKET=
EXPO_ACCESS_TOKEN=       # для push, опційно
TZ=Europe/Warsaw
```

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
-- Контексти редаговані з Settings, не enum
CREATE TABLE contexts (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,          -- 'zt', 'da', 'cairn', 'zalando', 'home'
  label       text NOT NULL,
  color       text NOT NULL,                 -- '#5B8DEF'
  sort_order  int  NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false
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
  created_via   text CHECK (created_via IN ('app','mcp')) DEFAULT 'app'
);
CREATE INDEX idx_tasks_open ON tasks (status, context_id) WHERE status != 'done';

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

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
POST   /api/contexts           { label, color }
PATCH  /api/contexts/:id       { label?, color?, archived? }

GET    /api/tasks?context=&status=          (сортовано по sort_*)
POST   /api/tasks              { title, context_id?, priority?, due_at?, remind_at?, recurrence? }
PATCH  /api/tasks/:id          (будь-які поля; { completed: true } → complete-логіка)
DELETE /api/tasks/:id
POST   /api/tasks/:id/reorder  { after_id?, before_id?, scope: 'global'|'context' }

POST   /api/tasks/:id/comments { body }
DELETE /api/comments/:id
POST   /api/tasks/:id/photos   → { upload_url, r2_key }   (presigned PUT в R2)
DELETE /api/photos/:id

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

Tools ("товсті", один виклик = повна дія):

```
create_task     { title, context?, priority?, due_at?, remind_at?,
                  recurrence? { rule, remind_time }, comment? }
                → створює задачу + правило (якщо recurrence) + одразу коментар
update_task     { id | title_match, patch }     -- title_match: пошук по назві, щоб
complete_task   { id | title_match }               я міг "закрий задачу про іпотеку"
delete_task     { id | title_match }
list_tasks      { context?, status?, due_before?, overdue? }
get_today       {} → задачі на сьогодні + рутина + активний таймер
add_comment     { task: id|title_match, body }
add_routine     { title, time_hint? }
start_timer     { task: id|title_match }
stop_timer      {}
list_contexts   {}
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

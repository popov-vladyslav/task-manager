import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  real,
  time,
  date,
  jsonb,
  primaryKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';

// Drizzle schema for type-safe queries. The authoritative DDL lives in
// drizzle/0000_init.sql (partial indexes, CHECK constraints, cascade rules).
// NOTE: no `priority` column anywhere — intentionally out of scope.

// Accounts. Email identity is case-insensitive — the UNIQUE index is on
// lower(email), so always look up with a lowercased value.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per signed-in device; revoking a device deletes its row.
export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  device: text('device'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Sign-in codes are keyed by email, not user: with implicit sign-up the account
// may not exist yet when the code is issued.
export const loginCodes = pgTable('login_codes', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Personal MCP tokens — hash only; the token itself is emailed once. A partial
// unique index (see 0010) allows at most one non-revoked row per user.
export const mcpTokens = pgTable('mcp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export const contexts = pgTable('contexts', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Unique per owner, not globally — see contexts_user_slug_uniq in 0010.
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
  excludeFromAll: boolean('exclude_from_all').notNull().default(false),
  emoji: text('emoji'),
});

export const recurrenceRules = pgTable(
  'recurrence_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    contextId: integer('context_id').references(() => contexts.id),
    rule: text('rule').notNull(),
    remindTime: time('remind_time'),
    // When set, spawned instances get a due_at at this time on their scheduled
    // day (and appear on the calendar). Null → instances spawn dateless. (CR02 §1)
    defaultDueTime: time('default_due_time'),
    dueOffsetD: integer('due_offset_d').default(0),
    active: boolean('active').notNull().default(true),
    lastSpawned: date('last_spawned'),
    // Last day the rule may spawn; null = open-ended.
    until: date('until'),
    // false → occurrences that pass unfinished close as 'skipped', not 'missed',
    // and stay out of every overdue count.
    tracksCompletion: boolean('tracks_completion').notNull().default(true),
    // Block length projected occurrences use on the calendar (0021 backfilled it
    // from each rule's latest task).
    durationMin: integer('duration_min'),
    // Group key shared by every rule a series was split into (0022); null until
    // the rule is first split.
    seriesId: uuid('series_id'),
  },
  (t) => [index('idx_recurrence_rules_series').on(t.userId, t.seriesId)],
);

// One moved occurrence of a rule: occurs_on is the day the rule matched, the
// times are where it moved to. Read by both the calendar projection and the
// spawner, so a moved occurrence also reminds at its moved time.
export const recurrenceOverrides = pgTable(
  'recurrence_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => recurrenceRules.id, { onDelete: 'cascade' }),
    occursOn: date('occurs_on').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    remindAt: timestamp('remind_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.ruleId, t.occursOn)],
);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  contextId: integer('context_id').references(() => contexts.id),
  // 'missed' is terminal, like 'done' — a recurring occurrence that was
  // superseded by the next one without being completed (0006 migration).
  // 'skipped' is terminal too: an occurrence of a rule that does not track
  // completion, which simply passed (0021 migration).
  status: text('status', { enum: ['active', 'waiting', 'done', 'missed', 'skipped'] })
    .notNull()
    .default('active'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  remindAt: timestamp('remind_at', { withTimezone: true }),
  durationMin: integer('duration_min'),
  // Total seconds tracked across all closed time_entries for this task. Kept in
  // sync whenever an interval is closed (services/timer.ts); time_entries stays
  // the source of truth.
  trackedSec: integer('tracked_sec').notNull().default(0),
  sortGlobal: real('sort_global').notNull().default(0),
  sortContext: real('sort_context').notNull().default(0),
  recurrenceId: uuid('recurrence_id'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdVia: text('created_via', { enum: ['app', 'mcp'] })
    .notNull()
    .default('app'),
  note: text('note'),
});

export const subtasks = pgTable(
  'subtasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    done: boolean('done').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_subtasks_task').on(t.taskId, t.sortOrder)],
);

export const timeEntries = pgTable('time_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const authTokens = pgTable('auth_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  kind: text('kind', { enum: ['magic', 'refresh'] }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const settings = pgTable(
  'settings',
  {
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: jsonb('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  device: text('device'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLog = pgTable('notification_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['initial', 'repeat', 'due'] }),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

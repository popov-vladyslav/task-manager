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
} from 'drizzle-orm/pg-core';

// Drizzle schema for type-safe queries. The authoritative DDL lives in
// drizzle/0000_init.sql (partial indexes, CHECK constraints, cascade rules).
// NOTE: no `priority` column anywhere — intentionally out of scope.

export const contexts = pgTable('contexts', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: boolean('archived').notNull().default(false),
});

export const recurrenceRules = pgTable('recurrence_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  contextId: integer('context_id').references(() => contexts.id),
  rule: text('rule').notNull(),
  remindTime: time('remind_time'),
  dueOffsetD: integer('due_offset_d').default(0),
  active: boolean('active').notNull().default(true),
  lastSpawned: date('last_spawned'),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  contextId: integer('context_id').references(() => contexts.id),
  status: text('status', { enum: ['active', 'waiting', 'done'] })
    .notNull()
    .default('active'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  remindAt: timestamp('remind_at', { withTimezone: true }),
  sortGlobal: real('sort_global').notNull().default(0),
  sortContext: real('sort_context').notNull().default(0),
  recurrenceId: uuid('recurrence_id'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdVia: text('created_via', { enum: ['app', 'mcp'] }).notNull().default('app'),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authTokens = pgTable('auth_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  kind: text('kind', { enum: ['magic', 'refresh'] }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const oauthClients = pgTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

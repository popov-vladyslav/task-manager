// Wire (JSON) contracts shared between the Express API and the Expo client.
// Timestamps cross the wire as ISO-8601 strings (the DB layer maps Date <-> string).
// NOTE: task priority is intentionally out of scope (removed from DB, API, and UI).

export type TaskStatus = 'active' | 'waiting' | 'done';
export type CreatedVia = 'app' | 'mcp';
export type ReorderScope = 'global' | 'context';

export interface Context {
  id: number;
  slug: string;
  label: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export interface Task {
  id: string;
  title: string;
  contextId: number | null;
  status: TaskStatus;
  dueAt: string | null;
  remindAt: string | null;
  sortGlobal: number;
  sortContext: number;
  recurrenceId: string | null;
  recurrenceRule: string | null; // e.g. 'daily' | 'weekly:mon' | 'monthly:15'
  completedAt: string | null;
  createdAt: string;
  createdVia: CreatedVia;
  // Derived fields for the list/detail UI (populated by the service layer):
  commentsCount: number;
  photosCount: number;
  nextInstance: string | null; // computed from the recurrence rule, when recurring
}

export interface RecurrenceInput {
  rule: string; // 'monthly:1' | 'monthly:20' | 'weekly:mon' | 'daily'
  remindTime?: string | null; // 'HH:MM'
  dueOffsetDays?: number;
}

export interface CreateTaskInput {
  title: string;
  contextId?: number | null;
  dueAt?: string | null;
  remindAt?: string | null;
  recurrence?: RecurrenceInput | null;
}

export interface UpdateTaskInput {
  title?: string;
  contextId?: number | null;
  status?: TaskStatus;
  dueAt?: string | null;
  remindAt?: string | null;
  completed?: boolean; // true => run complete-logic
  recurrence?: RecurrenceInput | null; // set/change a rule, or null to remove
}

export interface CreateCommentInput {
  body: string;
}

export interface ReorderInput {
  afterId?: string | null;
  beforeId?: string | null;
  scope: ReorderScope;
}

export interface CreateContextInput {
  label: string;
  color: string;
  slug?: string;
}

export interface UpdateContextInput {
  label?: string;
  color?: string;
  archived?: boolean;
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
}

// Routines — a fixed daily checklist. `done` reflects completion for the
// current (Europe/Warsaw) day; GET /api/routines returns only active ones.
export interface Routine {
  id: number;
  title: string;
  timeHint: string | null; // 'HH:MM' — an approximate time, not a trigger
  sortOrder: number;
  active: boolean;
  done: boolean;
}

export interface CreateRoutineInput {
  title: string;
  timeHint?: string | null; // 'HH:MM'
}

export interface UpdateRoutineInput {
  title?: string;
  timeHint?: string | null;
  active?: boolean;
  sortOrder?: number;
}

// Auth
export interface AuthTokens {
  jwt: string;
  refresh: string;
}

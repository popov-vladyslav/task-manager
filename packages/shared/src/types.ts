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
  // When true, this context's tasks are hidden from the "All" view and the
  // Calendar; reachable only by selecting the context's own chip.
  excludeFromAll: boolean;
}

export interface Task {
  id: string;
  title: string;
  contextId: number | null;
  status: TaskStatus;
  dueAt: string | null;
  remindAt: string | null;
  // Deadline (dueAt) is a point in time (date + time). When it's set, the task
  // is a scheduled calendar block of `durationMin` minutes (defaults to 30).
  // durationMin is non-null iff dueAt is non-null (enforced in the service).
  durationMin: number | null;
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
  durationMin?: number | null;
  recurrence?: RecurrenceInput | null;
}

export interface UpdateTaskInput {
  title?: string;
  contextId?: number | null;
  status?: TaskStatus;
  dueAt?: string | null;
  remindAt?: string | null;
  durationMin?: number | null;
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
  excludeFromAll?: boolean;
}

export interface UpdateContextInput {
  label?: string;
  color?: string;
  archived?: boolean;
  excludeFromAll?: boolean;
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
}

// Timer — at most one running entry at a time (one_running_timer unique index).
export interface TimeEntry {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
}

// The running timer, enriched with its task title for the persistent timer bar.
export interface ActiveTimer {
  id: string;
  taskId: string;
  taskTitle: string;
  startedAt: string;
}

// Calendar (GET /api/calendar?from=&to=): scheduled task time-blocks overlapping
// the range, each carrying its task's context for coloring. Sourced from tasks
// (due_at + duration_min) — NOT from timer time_entries. Completed tasks are
// included (rendered as done), not filtered out.
export interface CalendarBlock {
  id: string; // task id
  title: string;
  contextId: number | null;
  startAt: string; // = the deadline (due_at)
  endAt: string; // = due_at + duration_min minutes
  done: boolean;
}

export interface CalendarData {
  blocks: CalendarBlock[];
}

// Auth
export interface AuthTokens {
  jwt: string;
  refresh: string;
}

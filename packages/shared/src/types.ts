// Wire (JSON) contracts shared between the Express API and the Expo client.
// Timestamps cross the wire as ISO-8601 strings (the DB layer maps Date <-> string).
// NOTE: task priority is intentionally out of scope (removed from DB, API, and UI).

// 'done', 'missed' and 'skipped' are all terminal: none shows in an active list.
// 'missed' closes out a recurring occurrence that was superseded by the next
// one without ever being completed (see services/recurring.ts). 'skipped' does
// the same for a rule that does not track completion — a routine nobody ticks
// off, which must stay out of every overdue count. Only the recurrence engine
// sets either; ordinary one-off tasks are never marked missed or skipped.
export type TaskStatus = 'active' | 'waiting' | 'done' | 'missed' | 'skipped';

// Statuses that keep a task out of every open/active list.
export const TERMINAL_STATUSES = [
  'done',
  'missed',
  'skipped',
] as const satisfies readonly TaskStatus[];
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
  emoji: string | null;
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
  // Total time tracked on this task, in seconds, accumulated across every timer
  // session. 0 when it has never been tracked (the UI then shows nothing).
  trackedSec: number;
  sortGlobal: number;
  sortContext: number;
  recurrenceId: string | null;
  recurrenceRule: string | null; // e.g. 'daily' | 'weekly:mon' | 'monthly:15'
  recurrenceUntil: string | null; // 'YYYY-MM-DD' — the rule's last day, when it has one
  // Mirrors the rule's tracks_completion. True on a task with no rule: the
  // field only means anything for a recurring occurrence.
  tracksCompletion: boolean;
  completedAt: string | null;
  createdAt: string;
  createdVia: CreatedVia;
  note: string | null;
  subtasks: Subtask[];
  // Derived fields for the list/detail UI (populated by the service layer):
  nextInstance: string | null; // computed from the recurrence rule, when recurring
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CreateSubtaskInput {
  title: string;
}

export interface UpdateSubtaskInput {
  title?: string;
  done?: boolean;
}

export interface RecurrenceInput {
  rule: string; // 'monthly:1' | 'monthly:20' | 'weekly:mon' | 'daily'
  remindTime?: string | null; // 'HH:MM'
  dueOffsetDays?: number;
  until?: string | null; // 'YYYY-MM-DD' — last day the rule spawns; null = open-ended
  // false => an occurrence that passes unfinished closes as 'skipped' and stays
  // out of every overdue count. A routine nobody ticks off.
  tracksCompletion?: boolean;
}

export interface CreateTaskInput {
  title: string;
  contextId?: number | null;
  dueAt?: string | null;
  remindAt?: string | null;
  durationMin?: number | null;
  recurrence?: RecurrenceInput | null;
  note?: string | null;
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
  note?: string | null;
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
  emoji?: string | null;
}

export interface UpdateContextInput {
  label?: string;
  color?: string;
  archived?: boolean;
  excludeFromAll?: boolean;
  emoji?: string | null;
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
  // Stable identity for lists, layout and drag: the task id for a real block,
  // `${ruleId}@${occursOn}` for a projected one. Always present — unlike `id`.
  key: string;
  // The task row behind this block, or null for a ghost, which has none.
  id: string | null;
  title: string;
  contextId: number | null;
  startAt: string; // = the deadline (due_at)
  endAt: string; // = due_at + duration_min minutes
  done: boolean;
  // A projected future occurrence of a recurrence rule: computed per request
  // from the rule, never stored, and not yet a task (ADR 0010).
  virtual: boolean;
  // The rule this block belongs to — set on real occurrences too, so a drag can
  // ask "this one or the whole series?" either way.
  ruleId: string | null;
  // 'YYYY-MM-DD'. For a projected block, the day the rule matched — with a
  // due_offset_d not the day it is drawn on. For a real block, the local day of
  // its deadline. Null for a one-off task.
  occursOn: string | null;
}

export interface CalendarData {
  blocks: CalendarBlock[];
}

// Morning summary (GET /api/summary/morning): unfinished ORDINARY tasks from
// before today. `yesterday` is the actionable list; `older` is the potentially
// long, stale pile the UI keeps collapsed. Occurrences of recurring tasks are
// never included — a skipped routine must not nag.
export interface MorningSummary {
  yesterday: Task[];
  older: Task[];
  generatedAt: string;
}

// Auth
export interface AuthTokens {
  jwt: string;
  refresh: string;
}

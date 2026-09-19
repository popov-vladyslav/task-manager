import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { contextEmoji, EMOJI_MAX_LENGTH, isSingleGrapheme } from '@task-manager/shared';
import type {
  Context,
  RecurrenceInput,
  Task,
  UpdateContextInput,
} from '@task-manager/shared';
import * as tasksSvc from '../services/tasks';
import * as contextsSvc from '../services/contexts';
import * as subtasksSvc from '../services/subtasks';
import * as timerSvc from '../services/timer';
import { ruleFromSpec } from '../lib/recurrence';
import { fmtTask } from '../lib/mcp-task-format';
import { fmtWhen } from '../lib/when';

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] };
}

type ToolResult = ReturnType<typeof text>;

function logWrite(tool: string, data: Record<string, unknown>) {
  console.log(`[mcp] ${tool} ${JSON.stringify(data)}`);
}

// Structured recurrence for the MCP surface. Serialized (via ruleFromSpec) to the
// canonical rule string the engine understands, so the model can never store an
// unparseable free-form rule.
const recurrenceInput = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  days: z
    .array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']))
    .optional()
    .describe("Weekdays for freq='weekly', e.g. ['mon','wed','fri']. Required when weekly."),
  day_of_month: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe("Day of month (1-31) for freq='monthly'. Defaults to 1."),
  remind_time: z.string().optional().describe("Reminder time 'HH:MM' applied to each occurrence."),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Last day the rule repeats, 'YYYY-MM-DD'. Omit for an open-ended rule."),
  tracks_completion: z
    .boolean()
    .optional()
    .describe(
      'Whether occurrences are meant to be ticked off (default true). False for a routine ' +
        'nobody completes by hand: an occurrence that passes is closed as skipped and never ' +
        'counts as overdue.',
    ),
});
type RecurrenceMcpInput = z.infer<typeof recurrenceInput>;

function toRecurrenceInput(rule: string, r: RecurrenceMcpInput): RecurrenceInput {
  return {
    rule,
    remindTime: r.remind_time ?? null,
    until: r.until ?? null,
    tracksCompletion: r.tracks_completion ?? true,
  };
}

function toRuleString(r: RecurrenceMcpInput): { rule: string } | { error: string } {
  try {
    return { rule: ruleFromSpec({ freq: r.freq, days: r.days, dayOfMonth: r.day_of_month }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid recurrence.' };
  }
}

async function contextLabels(userId: string): Promise<Map<number, string>> {
  const cs = await contextsSvc.listContexts(userId);
  return new Map(cs.map((c) => [c.id, c.label]));
}

interface Resolved {
  task?: Task;
  candidates: Task[];
}

async function resolveTask(userId: string, id?: string, titleMatch?: string): Promise<Resolved> {
  if (id) {
    try {
      return { task: await tasksSvc.getTask(userId, id), candidates: [] };
    } catch {
      return { candidates: [] };
    }
  }
  if (titleMatch) {
    const matches = await tasksSvc.searchOpenTasks(userId, titleMatch);
    return matches.length === 1 ? { task: matches[0], candidates: [] } : { candidates: matches };
  }
  return { candidates: [] };
}

function unresolvedText(candidates: Task[], query?: string): string {
  if (candidates.length === 0) {
    return `No open task matches ${query ? `"${query}"` : 'that'}. Use list_tasks to see options.`;
  }
  return (
    `Multiple tasks match — call again with a specific id:\n` +
    candidates.map((t) => `• ${t.title} [${t.id}]`).join('\n')
  );
}

// Builds a fresh MCP server with all tools bound to the service layer.
// Priority is intentionally out of scope.
// `userId` scopes every tool call to one account. The legacy static token
// resolves it to the owner (services/users.ts); per-user tokens supply their
// own — see routes/mcp.ts.
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: 'log-task-manager', version: '1.0.0' });

  // The MCP SDK bundles zod v3, but this project is on zod v4 — their schema types
  // aren't structurally compatible, so registerTool rejects our inputSchema shapes
  // and infers handler args as `any` (64 spurious tsc errors). Runtime is unaffected:
  // tsx strips types and the SDK reads the shape by duck-typing. `reg` casts at this
  // single boundary while its own signature keeps full zod-v4 inference on `args`.
  const rawRegister = server.registerTool.bind(server) as (
    name: string,
    config: unknown,
    handler: unknown,
  ) => void;
  const reg = <S extends z.ZodRawShape>(
    name: string,
    config: { title?: string; description: string; inputSchema: S },
    handler: (args: z.infer<z.ZodObject<S>>) => ToolResult | Promise<ToolResult>,
  ): void => {
    rawRegister(name, config, handler);
  };

  const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #RRGGBB hex string');
  const emojiSchema = z
    .string()
    .trim()
    .max(EMOJI_MAX_LENGTH)
    .refine(isSingleGrapheme, 'Emoji must be a single character');
  const fmtContext = (c: Context) =>
    `${contextEmoji(c) ?? ''} ${c.slug} — ${c.label} (${c.color})`.trim();

  reg(
    'list_contexts',
    { description: 'List the work contexts (emoji, slug, label, color).', inputSchema: {} },
    async () => {
      const cs = await contextsSvc.listContexts(userId);
      return text(cs.map(fmtContext).join('\n') || 'No contexts.');
    },
  );

  reg(
    'create_context',
    {
      description:
        'Create a work context. Provide a label and a #RRGGBB hex color (e.g. #4FB6A9). Slug is auto-generated. Optional emoji (one character) shown next to the name; without it one is derived from the color. Set exclude_from_all to hide its tasks from the All view (reachable via its own chip) — good for routines / repeated payments.',
      inputSchema: {
        label: z.string().min(1),
        color: hexColor,
        emoji: emojiSchema.optional(),
        exclude_from_all: z.boolean().optional(),
      },
    },
    async ({ label, color, emoji, exclude_from_all }) => {
      const c = await contextsSvc.createContext(userId, {
        label,
        color,
        emoji,
        excludeFromAll: exclude_from_all,
      });
      logWrite('create_context', { id: c.id, slug: c.slug });
      return text(`Created context: ${fmtContext(c)}`);
    },
  );

  reg(
    'update_context',
    {
      description:
        'Rename, recolor (#RRGGBB), set or clear the emoji (pass null to clear), or toggle exclude_from_all on a context, identified by its slug.',
      inputSchema: {
        slug: z.string().min(1),
        label: z.string().min(1).optional(),
        color: hexColor.optional(),
        emoji: emojiSchema.nullable().optional(),
        exclude_from_all: z.boolean().optional(),
      },
    },
    async ({ slug, label, color, emoji, exclude_from_all }) => {
      const c = await contextsSvc.findContextBySlug(userId, slug);
      if (!c) return text(`Unknown context '${slug}'.`);
      const patch: UpdateContextInput = {};
      if (label !== undefined) patch.label = label;
      if (color !== undefined) patch.color = color;
      if (emoji !== undefined) patch.emoji = emoji;
      if (exclude_from_all !== undefined) patch.excludeFromAll = exclude_from_all;
      const updated = await contextsSvc.updateContext(userId, c.id, patch);
      logWrite('update_context', { id: updated.id, slug: updated.slug });
      return text(`Updated context: ${fmtContext(updated)}`);
    },
  );

  reg(
    'delete_context',
    {
      description:
        'Delete a context by slug. Refuses (with a count) if any task or recurring rule still uses it — move or delete those first.',
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const c = await contextsSvc.findContextBySlug(userId, slug);
      if (!c) return text(`Unknown context '${slug}'.`);
      try {
        await contextsSvc.deleteContext(userId, c.id);
      } catch (err) {
        return text(err instanceof Error ? err.message : 'Could not delete context.');
      }
      logWrite('delete_context', { id: c.id, slug });
      return text(`Deleted context: ${slug}.`);
    },
  );

  reg(
    'list_tasks',
    {
      description:
        'List open tasks (times shown in Europe/Warsaw). Filter by context slug, status, or overdue. Each task with a deadline reports duration_min — its block length in minutes; when no explicit duration was set this is the implicit default and is marked "(default)". A note, when set, is shown inline (first 200 chars).',
      inputSchema: {
        context: z.string().optional(),
        status: z.enum(['active', 'waiting', 'done', 'missed', 'skipped']).optional(),
        overdue: z.boolean().optional(),
      },
    },
    async ({ context, status, overdue }) => {
      let contextId: number | undefined;
      if (context) {
        const c = await contextsSvc.findContextBySlug(userId, context);
        if (!c) return text(`Unknown context '${context}'.`);
        contextId = c.id;
      }
      // An occurrence of a routine that is not ticked off is never overdue, so
      // it is dropped from this list entirely rather than at a day boundary.
      const now = new Date();
      const list = await tasksSvc.listTasks(userId, {
        contextId,
        status,
        dueBefore: overdue ? now : undefined,
        dropUntrackedBefore: overdue ? now : undefined,
      });
      const labels = await contextLabels(userId);
      return text(
        list.length
          ? list
              .map((t) => fmtTask(t, t.contextId ? labels.get(t.contextId) : undefined))
              .join('\n')
          : 'No matching tasks.',
      );
    },
  );

  reg(
    'get_today',
    {
      description:
        'Today\'s agenda: open tasks due today or overdue, plus any running timer. Each task reports duration_min — its block length in minutes; when no explicit duration was set this is the implicit default and is marked "(default)". A note, when set, is shown inline (first 200 chars).',
      inputSchema: {},
    },
    async () => {
      const [list, labels, active] = await Promise.all([
        tasksSvc.tasksDueToday(userId),
        contextLabels(userId),
        timerSvc.getActiveTimer(userId),
      ]);
      const tasksSection = list.length
        ? 'Due today / overdue:\n' +
          list.map((t) => fmtTask(t, t.contextId ? labels.get(t.contextId) : undefined)).join('\n')
        : 'Nothing due today.';
      const timerSection = active
        ? `\n\n⏱ Timer running: ${active.taskTitle} (since ${fmtWhen(active.startedAt)})`
        : '';
      return text(tasksSection + timerSection);
    },
  );

  reg(
    'create_task',
    {
      description:
        'Create a task. Optionally set context (slug), due_at (ISO 8601 — the deadline, also the calendar block start; a value without an offset is Europe/Warsaw local time, e.g. 2026-09-15T18:00 — add +02:00 or Z to be explicit), remind_at (same format), duration_min (block length in minutes; a task with a due_at is shown on the calendar, default 30 min), recurrence (a repeat rule — see the recurrence field), and a note (free text attached to the task).',
      inputSchema: {
        title: z.string().min(1),
        context: z.string().optional(),
        due_at: z.string().optional(),
        remind_at: z.string().optional(),
        duration_min: z.number().int().positive().optional(),
        recurrence: recurrenceInput.optional(),
        note: z.string().optional(),
      },
    },
    async ({ title, context, due_at, remind_at, duration_min, recurrence, note }) => {
      let contextId: number | null = null;
      if (context) {
        const c = await contextsSvc.findContextBySlug(userId, context);
        if (!c) return text(`Unknown context '${context}'.`);
        contextId = c.id;
      }
      let recurrenceRule: RecurrenceInput | null = null;
      if (recurrence) {
        const r = toRuleString(recurrence);
        if ('error' in r) return text(r.error);
        recurrenceRule = toRecurrenceInput(r.rule, recurrence);
      }
      const task = await tasksSvc.createTask(userId, {
        title,
        contextId,
        dueAt: due_at ?? null,
        remindAt: remind_at ?? null,
        durationMin: duration_min ?? null,
        recurrence: recurrenceRule,
        note: note ?? null,
      });
      logWrite('create_task', { id: task.id, title });
      return text(`Created: ${fmtTask(task)}`);
    },
  );

  reg(
    'update_task',
    {
      description:
        'Update a task by id or title_match. Set any of: title, context (slug), due_at (deadline / calendar block start; ISO 8601, zone-less = Europe/Warsaw local time; pass null to clear), remind_at (same format), duration_min (block length in minutes), status, recurrence (a repeat rule — pass null to remove), note (free text; pass null to clear — use append_note to add to it instead of replacing).',
      inputSchema: {
        id: z.string().optional(),
        title_match: z.string().optional(),
        title: z.string().optional(),
        context: z.string().optional(),
        due_at: z.string().nullable().optional(),
        remind_at: z.string().nullable().optional(),
        duration_min: z.number().int().positive().nullable().optional(),
        status: z.enum(['active', 'waiting', 'done', 'missed', 'skipped']).optional(),
        recurrence: recurrenceInput.nullable().optional(),
        note: z.string().nullable().optional(),
      },
    },
    async (a) => {
      const r = await resolveTask(userId, a.id, a.title_match);
      if (!r.task) return text(unresolvedText(r.candidates, a.title_match));
      const patch: Parameters<typeof tasksSvc.updateTask>[2] = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.due_at !== undefined) patch.dueAt = a.due_at;
      if (a.remind_at !== undefined) patch.remindAt = a.remind_at;
      if (a.duration_min !== undefined) patch.durationMin = a.duration_min;
      if (a.status !== undefined) patch.status = a.status;
      if (a.note !== undefined) patch.note = a.note;
      if (a.context !== undefined) {
        const c = await contextsSvc.findContextBySlug(userId, a.context);
        if (!c) return text(`Unknown context '${a.context}'.`);
        patch.contextId = c.id;
      }
      if (a.recurrence !== undefined) {
        if (a.recurrence === null) {
          patch.recurrence = null;
        } else {
          const rr = toRuleString(a.recurrence);
          if ('error' in rr) return text(rr.error);
          patch.recurrence = toRecurrenceInput(rr.rule, a.recurrence);
        }
      }
      const updated = await tasksSvc.updateTask(userId, r.task.id, patch);
      logWrite('update_task', { id: updated.id });
      return text(`Updated: ${fmtTask(updated)}`);
    },
  );

  reg(
    'complete_task',
    {
      description: 'Mark a task done, by id or title_match.',
      inputSchema: { id: z.string().optional(), title_match: z.string().optional() },
    },
    async ({ id, title_match }) => {
      const r = await resolveTask(userId, id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      const done = await tasksSvc.updateTask(userId, r.task.id, { completed: true });
      logWrite('complete_task', { id: done.id });
      const next =
        done.recurrenceId && done.nextInstance ? ` Next instance: ${done.nextInstance}.` : '';
      return text(`Completed: ${r.task.title}.${next}`);
    },
  );

  reg(
    'delete_task',
    {
      description: 'Delete a task, by id or title_match.',
      inputSchema: { id: z.string().optional(), title_match: z.string().optional() },
    },
    async ({ id, title_match }) => {
      const r = await resolveTask(userId, id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      await tasksSvc.deleteTask(userId, r.task.id);
      logWrite('delete_task', { id: r.task.id });
      return text(`Deleted: ${r.task.title}.`);
    },
  );

  reg(
    'start_timer',
    {
      description:
        'Start the time tracker on a task (by id or title_match). Stops any timer already running.',
      inputSchema: { id: z.string().optional(), title_match: z.string().optional() },
    },
    async ({ id, title_match }) => {
      const r = await resolveTask(userId, id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      const active = await timerSvc.startTimer(userId, r.task.id);
      logWrite('start_timer', { taskId: active.taskId });
      return text(`Timer started for "${active.taskTitle}".`);
    },
  );

  reg(
    'stop_timer',
    { description: 'Stop the running time tracker.', inputSchema: {} },
    async () => {
      const active = await timerSvc.getActiveTimer(userId);
      const stopped = await timerSvc.stopTimer(userId);
      if (!stopped || !stopped.endedAt) return text('No timer running.');
      const mins = Math.round(
        (Date.parse(stopped.endedAt) - Date.parse(stopped.startedAt)) / 60000,
      );
      logWrite('stop_timer', { taskId: stopped.taskId });
      return text(`Timer stopped for "${active?.taskTitle ?? 'task'}" — ${mins} min.`);
    },
  );

  reg(
    'append_note',
    {
      description:
        "Append text to a task's note (kept, separated by a blank line), by id or title_match. Use this to add context to a task without overwriting what is already there.",
      inputSchema: {
        id: z.string().optional(),
        title_match: z.string().optional(),
        text: z.string().min(1),
      },
    },
    async ({ id, title_match, text: body }) => {
      const r = await resolveTask(userId, id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      const updated = await tasksSvc.appendNote(userId, r.task.id, body);
      logWrite('append_note', { id: updated.id });
      return text(`Note updated: ${fmtTask(updated)}`);
    },
  );

  reg(
    'add_subtask',
    {
      description:
        'Add a checklist item (subtask) to a task, by id or title_match. Subtasks are plain checklist lines: no dates, reminders or timers. They are printed under the task as "[ ] title [subtask id]".',
      inputSchema: {
        id: z.string().optional(),
        title_match: z.string().optional(),
        title: z.string().min(1),
      },
    },
    async ({ id, title_match, title }) => {
      const r = await resolveTask(userId, id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      const updated = await subtasksSvc.addSubtask(userId, r.task.id, title);
      logWrite('add_subtask', { taskId: updated.id });
      return text(`Subtask added: ${fmtTask(updated)}`);
    },
  );

  reg(
    'update_subtask',
    {
      description:
        'Tick, untick or rename a subtask by its subtask id (the id in brackets on its "[ ]" line). Set done: true to complete it.',
      inputSchema: {
        subtask_id: z.string().min(1),
        title: z.string().min(1).optional(),
        done: z.boolean().optional(),
      },
    },
    async ({ subtask_id, title, done }) => {
      const taskId = await subtasksSvc.parentTaskId(userId, subtask_id);
      if (!taskId) return text('Subtask not found.');
      const updated = await subtasksSvc.updateSubtask(userId, taskId, subtask_id, { title, done });
      logWrite('update_subtask', { taskId, subtaskId: subtask_id });
      return text(`Subtask updated: ${fmtTask(updated)}`);
    },
  );

  reg(
    'delete_subtask',
    {
      description: 'Delete a subtask by its subtask id.',
      inputSchema: { subtask_id: z.string().min(1) },
    },
    async ({ subtask_id }) => {
      const taskId = await subtasksSvc.parentTaskId(userId, subtask_id);
      if (!taskId) return text('Subtask not found.');
      const updated = await subtasksSvc.deleteSubtask(userId, taskId, subtask_id);
      logWrite('delete_subtask', { taskId, subtaskId: subtask_id });
      return text(`Subtask deleted: ${fmtTask(updated)}`);
    },
  );

  return server;
}

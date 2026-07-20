import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Task } from '@task-manager/shared';
import * as tasksSvc from '../services/tasks';
import * as contextsSvc from '../services/contexts';
import * as commentsSvc from '../services/comments';
import * as timerSvc from '../services/timer';

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] };
}

function logWrite(tool: string, data: Record<string, unknown>) {
  console.log(`[mcp] ${tool} ${JSON.stringify(data)}`);
}

function fmtTask(t: Task, contextLabel?: string): string {
  const bits = [`• ${t.title}`, `[${t.id}]`];
  if (contextLabel) bits.push(`(${contextLabel})`);
  if (t.dueAt) {
    bits.push(`due ${t.dueAt.slice(0, 16).replace('T', ' ')}`);
    if (t.durationMin) bits.push(`${t.durationMin}min`);
  }
  if (t.remindAt) bits.push(`remind ${t.remindAt.slice(0, 16).replace('T', ' ')}`);
  if (t.recurrenceRule) {
    bits.push(`repeats ${t.recurrenceRule}${t.nextInstance ? ` (next ${t.nextInstance})` : ''}`);
  }
  if (t.status !== 'active') bits.push(t.status);
  if (t.commentsCount) bits.push(`${t.commentsCount} comment(s)`);
  return bits.join(' ');
}

async function contextLabels(): Promise<Map<number, string>> {
  const cs = await contextsSvc.listContexts();
  return new Map(cs.map((c) => [c.id, c.label]));
}

interface Resolved {
  task?: Task;
  candidates: Task[];
}

async function resolveTask(id?: string, titleMatch?: string): Promise<Resolved> {
  if (id) {
    try {
      return { task: await tasksSvc.getTask(id), candidates: [] };
    } catch {
      return { candidates: [] };
    }
  }
  if (titleMatch) {
    const matches = await tasksSvc.searchOpenTasks(titleMatch);
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
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'log-task-manager', version: '1.0.0' });

  server.registerTool(
    'list_contexts',
    { description: 'List the work contexts (slug, label, color).', inputSchema: {} },
    async () => {
      const cs = await contextsSvc.listContexts();
      return text(cs.map((c) => `${c.slug} — ${c.label} (${c.color})`).join('\n') || 'No contexts.');
    },
  );

  server.registerTool(
    'create_context',
    {
      description:
        'Create a work context. Provide a label and a hex color (e.g. #4FB6A9). Slug is auto-generated. Set exclude_from_all to hide its tasks from the All view and Calendar (reachable via its own chip) — good for routines / repeated payments.',
      inputSchema: {
        label: z.string().min(1),
        color: z.string().min(1),
        exclude_from_all: z.boolean().optional(),
      },
    },
    async ({ label, color, exclude_from_all }) => {
      const c = await contextsSvc.createContext({ label, color, excludeFromAll: exclude_from_all });
      logWrite('create_context', { id: c.id, slug: c.slug });
      return text(`Created context: ${c.slug} — ${c.label} (${c.color})`);
    },
  );

  server.registerTool(
    'update_context',
    {
      description:
        'Rename, recolor, or toggle exclude_from_all on a context, identified by its slug.',
      inputSchema: {
        slug: z.string().min(1),
        label: z.string().min(1).optional(),
        color: z.string().min(1).optional(),
        exclude_from_all: z.boolean().optional(),
      },
    },
    async ({ slug, label, color, exclude_from_all }) => {
      const c = await contextsSvc.findContextBySlug(slug);
      if (!c) return text(`Unknown context '${slug}'.`);
      const patch: { label?: string; color?: string; excludeFromAll?: boolean } = {};
      if (label !== undefined) patch.label = label;
      if (color !== undefined) patch.color = color;
      if (exclude_from_all !== undefined) patch.excludeFromAll = exclude_from_all;
      const updated = await contextsSvc.updateContext(c.id, patch);
      logWrite('update_context', { id: updated.id, slug: updated.slug });
      return text(`Updated context: ${updated.slug} — ${updated.label} (${updated.color})`);
    },
  );

  server.registerTool(
    'delete_context',
    {
      description:
        'Delete a context by slug. Refuses (with a count) if any task or recurring rule still uses it — move or delete those first.',
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const c = await contextsSvc.findContextBySlug(slug);
      if (!c) return text(`Unknown context '${slug}'.`);
      try {
        await contextsSvc.deleteContext(c.id);
      } catch (err) {
        return text(err instanceof Error ? err.message : 'Could not delete context.');
      }
      logWrite('delete_context', { id: c.id, slug });
      return text(`Deleted context: ${slug}.`);
    },
  );

  server.registerTool(
    'list_tasks',
    {
      description: 'List open tasks. Filter by context slug, status, or overdue.',
      inputSchema: {
        context: z.string().optional(),
        status: z.enum(['active', 'waiting', 'done']).optional(),
        overdue: z.boolean().optional(),
      },
    },
    async ({ context, status, overdue }) => {
      let contextId: number | undefined;
      if (context) {
        const c = await contextsSvc.findContextBySlug(context);
        if (!c) return text(`Unknown context '${context}'.`);
        contextId = c.id;
      }
      const list = await tasksSvc.listTasks({
        contextId,
        status,
        dueBefore: overdue ? new Date() : undefined,
      });
      const labels = await contextLabels();
      return text(
        list.length
          ? list.map((t) => fmtTask(t, t.contextId ? labels.get(t.contextId) : undefined)).join('\n')
          : 'No matching tasks.',
      );
    },
  );

  server.registerTool(
    'get_today',
    {
      description: "Today's agenda: open tasks due today or overdue, plus any running timer.",
      inputSchema: {},
    },
    async () => {
      const [list, labels, active] = await Promise.all([
        tasksSvc.tasksDueToday(),
        contextLabels(),
        timerSvc.getActiveTimer(),
      ]);
      const tasksSection = list.length
        ? 'Due today / overdue:\n' +
          list.map((t) => fmtTask(t, t.contextId ? labels.get(t.contextId) : undefined)).join('\n')
        : 'Nothing due today.';
      const timerSection = active
        ? `\n\n⏱ Timer running: ${active.taskTitle} (since ${active.startedAt.slice(11, 16)} UTC)`
        : '';
      return text(tasksSection + timerSection);
    },
  );

  server.registerTool(
    'create_task',
    {
      description:
        'Create a task. Optionally set context (slug), due_at (ISO — the deadline, also the calendar block start), remind_at (ISO), duration_min (block length in minutes; a task with a due_at is shown on the calendar, default 30 min), recurrence, and an initial comment.',
      inputSchema: {
        title: z.string().min(1),
        context: z.string().optional(),
        due_at: z.string().optional(),
        remind_at: z.string().optional(),
        duration_min: z.number().int().positive().optional(),
        recurrence: z
          .object({ rule: z.string().min(1), remind_time: z.string().optional() })
          .optional(),
        comment: z.string().optional(),
      },
    },
    async ({ title, context, due_at, remind_at, duration_min, recurrence, comment }) => {
      let contextId: number | null = null;
      if (context) {
        const c = await contextsSvc.findContextBySlug(context);
        if (!c) return text(`Unknown context '${context}'.`);
        contextId = c.id;
      }
      const task = await tasksSvc.createTask({
        title,
        contextId,
        dueAt: due_at ?? null,
        remindAt: remind_at ?? null,
        durationMin: duration_min ?? null,
        recurrence: recurrence
          ? { rule: recurrence.rule, remindTime: recurrence.remind_time ?? null }
          : null,
      });
      if (comment) await commentsSvc.addComment(task.id, comment);
      logWrite('create_task', { id: task.id, title });
      return text(`Created: ${fmtTask(task)}`);
    },
  );

  server.registerTool(
    'update_task',
    {
      description:
        'Update a task by id or title_match. Set any of: title, context (slug), due_at (deadline / calendar block start; pass null to clear), remind_at, duration_min (block length in minutes), status.',
      inputSchema: {
        id: z.string().optional(),
        title_match: z.string().optional(),
        title: z.string().optional(),
        context: z.string().optional(),
        due_at: z.string().nullable().optional(),
        remind_at: z.string().nullable().optional(),
        duration_min: z.number().int().positive().nullable().optional(),
        status: z.enum(['active', 'waiting', 'done']).optional(),
      },
    },
    async (a) => {
      const r = await resolveTask(a.id, a.title_match);
      if (!r.task) return text(unresolvedText(r.candidates, a.title_match));
      const patch: Parameters<typeof tasksSvc.updateTask>[1] = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.due_at !== undefined) patch.dueAt = a.due_at;
      if (a.remind_at !== undefined) patch.remindAt = a.remind_at;
      if (a.duration_min !== undefined) patch.durationMin = a.duration_min;
      if (a.status !== undefined) patch.status = a.status;
      if (a.context !== undefined) {
        const c = await contextsSvc.findContextBySlug(a.context);
        if (!c) return text(`Unknown context '${a.context}'.`);
        patch.contextId = c.id;
      }
      const updated = await tasksSvc.updateTask(r.task.id, patch);
      logWrite('update_task', { id: updated.id });
      return text(`Updated: ${fmtTask(updated)}`);
    },
  );

  server.registerTool(
    'complete_task',
    {
      description: 'Mark a task done, by id or title_match.',
      inputSchema: { id: z.string().optional(), title_match: z.string().optional() },
    },
    async ({ id, title_match }) => {
      const r = await resolveTask(id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      const done = await tasksSvc.updateTask(r.task.id, { completed: true });
      logWrite('complete_task', { id: done.id });
      const next = done.recurrenceId && done.nextInstance ? ` Next instance: ${done.nextInstance}.` : '';
      return text(`Completed: ${r.task.title}.${next}`);
    },
  );

  server.registerTool(
    'delete_task',
    {
      description: 'Delete a task, by id or title_match.',
      inputSchema: { id: z.string().optional(), title_match: z.string().optional() },
    },
    async ({ id, title_match }) => {
      const r = await resolveTask(id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      await tasksSvc.deleteTask(r.task.id);
      logWrite('delete_task', { id: r.task.id });
      return text(`Deleted: ${r.task.title}.`);
    },
  );


  server.registerTool(
    'start_timer',
    {
      description: 'Start the time tracker on a task (by id or title_match). Stops any timer already running.',
      inputSchema: { id: z.string().optional(), title_match: z.string().optional() },
    },
    async ({ id, title_match }) => {
      const r = await resolveTask(id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      const active = await timerSvc.startTimer(r.task.id);
      logWrite('start_timer', { taskId: active.taskId });
      return text(`Timer started for "${active.taskTitle}".`);
    },
  );

  server.registerTool(
    'stop_timer',
    { description: 'Stop the running time tracker.', inputSchema: {} },
    async () => {
      const active = await timerSvc.getActiveTimer();
      const stopped = await timerSvc.stopTimer();
      if (!stopped || !stopped.endedAt) return text('No timer running.');
      const mins = Math.round((Date.parse(stopped.endedAt) - Date.parse(stopped.startedAt)) / 60000);
      logWrite('stop_timer', { taskId: stopped.taskId });
      return text(`Timer stopped for "${active?.taskTitle ?? 'task'}" — ${mins} min.`);
    },
  );

  server.registerTool(
    'add_comment',
    {
      description: 'Add a comment to a task, by id or title_match.',
      inputSchema: {
        id: z.string().optional(),
        title_match: z.string().optional(),
        body: z.string().min(1),
      },
    },
    async ({ id, title_match, body }) => {
      const r = await resolveTask(id, title_match);
      if (!r.task) return text(unresolvedText(r.candidates, title_match));
      await commentsSvc.addComment(r.task.id, body);
      logWrite('add_comment', { id: r.task.id });
      return text(`Comment added to "${r.task.title}".`);
    },
  );

  return server;
}

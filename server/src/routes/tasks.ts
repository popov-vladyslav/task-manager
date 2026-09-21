import { Router } from 'express';
import { z } from 'zod';
import type { TaskStatus } from '@task-manager/shared';
import * as svc from '../services/tasks';
import * as subtasksSvc from '../services/subtasks';
import { requireUserId } from '../middleware/auth';
import { isValidRule } from '../lib/recurrence';

const router = Router();

const recurrenceSchema = z.object({
  // Reject malformed rules at the boundary — the service stores this verbatim and
  // the scheduler parses it later, so an unparseable rule would silently never spawn.
  rule: z.string().min(1).refine(isValidRule, 'Invalid recurrence rule'),
  remindTime: z.string().nullish(),
  dueOffsetDays: z.number().int().optional(),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'until must be YYYY-MM-DD')
    .nullish(),
  tracksCompletion: z.boolean().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  contextId: z.number().int().nullish(),
  dueAt: z.string().nullish(),
  remindAt: z.string().nullish(),
  durationMin: z.number().int().positive().nullish(),
  recurrence: recurrenceSchema.nullish(),
  note: z.string().nullish(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  contextId: z.number().int().nullable().optional(),
  status: z.enum(['active', 'waiting', 'done', 'missed', 'skipped']).optional(),
  dueAt: z.string().nullable().optional(),
  remindAt: z.string().nullable().optional(),
  durationMin: z.number().int().positive().nullable().optional(),
  completed: z.boolean().optional(),
  recurrence: recurrenceSchema.nullish(),
  note: z.string().nullable().optional(),
});

const deleteQuerySchema = z.object({ scope: z.enum(['occurrence', 'series']).optional() });

const reorderSchema = z.object({
  afterId: z.uuid().nullish(),
  beforeId: z.uuid().nullish(),
  scope: z.enum(['global', 'context']),
});

router.get('/', async (req, res) => {
  const raw = req.query.context;
  const contextId = typeof raw === 'string' && raw !== '' ? Number(raw) : undefined;
  const status =
    typeof req.query.status === 'string' ? (req.query.status as TaskStatus) : undefined;
  res.json(
    await svc.listTasks(requireUserId(req), {
      contextId: contextId != null && Number.isFinite(contextId) ? contextId : undefined,
      status,
    }),
  );
});

router.get('/completed-counts', async (req, res) => {
  res.json(await svc.completedCounts(requireUserId(req)));
});

router.get('/:id', async (req, res) => {
  res.json(await svc.getTask(requireUserId(req), req.params.id));
});

router.post('/', async (req, res) => {
  res.status(201).json(await svc.createTask(requireUserId(req), createSchema.parse(req.body)));
});

router.patch('/:id', async (req, res) => {
  res.json(await svc.updateTask(requireUserId(req), req.params.id, updateSchema.parse(req.body)));
});

router.delete('/:id', async (req, res) => {
  const { scope } = deleteQuerySchema.parse(req.query);
  await svc.deleteTask(requireUserId(req), req.params.id, { series: scope === 'series' });
  res.status(204).end();
});

router.post('/:id/reorder', async (req, res) => {
  res.json(await svc.reorderTask(requireUserId(req), req.params.id, reorderSchema.parse(req.body)));
});

router.post('/:id/snooze', async (req, res) => {
  const { minutes } = z.object({ minutes: z.number().int().positive() }).parse(req.body);
  res.json(await svc.snoozeTask(requireUserId(req), req.params.id, minutes));
});

const subtaskCreateSchema = z.object({ title: z.string().min(1) });
const subtaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
});
const subtaskReorderSchema = z.object({ ids: z.array(z.uuid()) });

router.post('/:id/subtasks', async (req, res) => {
  const { title } = subtaskCreateSchema.parse(req.body);
  res.status(201).json(await subtasksSvc.addSubtask(requireUserId(req), req.params.id, title));
});

router.post('/:id/subtasks/reorder', async (req, res) => {
  const { ids } = subtaskReorderSchema.parse(req.body);
  res.json(await subtasksSvc.reorderSubtasks(requireUserId(req), req.params.id, ids));
});

router.patch('/:id/subtasks/:sid', async (req, res) => {
  res.json(
    await subtasksSvc.updateSubtask(
      requireUserId(req),
      req.params.id,
      req.params.sid,
      subtaskUpdateSchema.parse(req.body),
    ),
  );
});

router.delete('/:id/subtasks/:sid', async (req, res) => {
  res.json(await subtasksSvc.deleteSubtask(requireUserId(req), req.params.id, req.params.sid));
});

export default router;

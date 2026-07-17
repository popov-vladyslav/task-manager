import { Router } from 'express';
import { z } from 'zod';
import type { TaskStatus } from '@task-manager/shared';
import * as svc from '../services/tasks';
import * as commentsSvc from '../services/comments';

const router = Router();

const recurrenceSchema = z.object({
  rule: z.string().min(1),
  remindTime: z.string().nullish(),
  dueOffsetDays: z.number().int().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  contextId: z.number().int().nullish(),
  dueAt: z.string().nullish(),
  remindAt: z.string().nullish(),
  durationMin: z.number().int().positive().nullish(),
  recurrence: recurrenceSchema.nullish(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  contextId: z.number().int().nullable().optional(),
  status: z.enum(['active', 'waiting', 'done']).optional(),
  dueAt: z.string().nullable().optional(),
  remindAt: z.string().nullable().optional(),
  durationMin: z.number().int().positive().nullable().optional(),
  completed: z.boolean().optional(),
  recurrence: recurrenceSchema.nullish(),
});

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
    await svc.listTasks({
      contextId: contextId != null && Number.isFinite(contextId) ? contextId : undefined,
      status,
    }),
  );
});

router.get('/:id', async (req, res) => {
  res.json(await svc.getTask(req.params.id));
});

router.post('/', async (req, res) => {
  res.status(201).json(await svc.createTask(createSchema.parse(req.body)));
});

router.patch('/:id', async (req, res) => {
  res.json(await svc.updateTask(req.params.id, updateSchema.parse(req.body)));
});

router.delete('/:id', async (req, res) => {
  await svc.deleteTask(req.params.id);
  res.status(204).end();
});

router.post('/:id/reorder', async (req, res) => {
  res.json(await svc.reorderTask(req.params.id, reorderSchema.parse(req.body)));
});

router.post('/:id/snooze', async (req, res) => {
  const { minutes } = z.object({ minutes: z.number().int().positive() }).parse(req.body);
  res.json(await svc.snoozeTask(req.params.id, minutes));
});

// ---- comments ----
router.get('/:id/comments', async (req, res) => {
  res.json(await commentsSvc.listComments(req.params.id));
});

router.post('/:id/comments', async (req, res) => {
  const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
  res.status(201).json(await commentsSvc.addComment(req.params.id, body));
});

export default router;

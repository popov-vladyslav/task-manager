import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/routines';

const router = Router();

const timeHint = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_hint must be HH:MM');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD');

const createSchema = z.object({
  title: z.string().min(1),
  timeHint: timeHint.nullish(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  timeHint: timeHint.nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const toggleSchema = z.object({ day: day.optional() });

router.get('/', async (_req, res) => {
  res.json(await svc.listRoutines());
});

router.post('/', async (req, res) => {
  res.status(201).json(await svc.createRoutine(createSchema.parse(req.body)));
});

router.patch('/:id', async (req, res) => {
  res.json(await svc.updateRoutine(Number(req.params.id), updateSchema.parse(req.body)));
});

router.post('/:id/toggle', async (req, res) => {
  res.json(await svc.toggleRoutine(Number(req.params.id), toggleSchema.parse(req.body ?? {}).day));
});

router.delete('/:id', async (req, res) => {
  await svc.deleteRoutine(Number(req.params.id));
  res.status(204).end();
});

export default router;

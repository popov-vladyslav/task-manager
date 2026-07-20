import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/contexts';

const router = Router();

const createSchema = z.object({
  label: z.string().min(1),
  color: z.string().min(1),
  slug: z.string().optional(),
  excludeFromAll: z.boolean().optional(),
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  excludeFromAll: z.boolean().optional(),
});

router.get('/', async (_req, res) => {
  res.json(await svc.listContexts());
});

router.post('/', async (req, res) => {
  res.status(201).json(await svc.createContext(createSchema.parse(req.body)));
});

router.patch('/:id', async (req, res) => {
  res.json(await svc.updateContext(Number(req.params.id), updateSchema.parse(req.body)));
});

router.delete('/:id', async (req, res) => {
  await svc.deleteContext(Number(req.params.id));
  res.status(204).end();
});

export default router;

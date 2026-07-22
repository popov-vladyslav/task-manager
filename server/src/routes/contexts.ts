import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/contexts';

const router = Router();

// #RRGGBB — the only form the palette emits and the only one the notification
// color→emoji matcher (nearestEmoji) can parse.
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #RRGGBB hex string');

const createSchema = z.object({
  label: z.string().min(1),
  color: hexColor,
  slug: z.string().optional(),
  excludeFromAll: z.boolean().optional(),
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  color: hexColor.optional(),
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

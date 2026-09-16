import { Router } from 'express';
import { z } from 'zod';
import { EMOJI_MAX_LENGTH, isSingleGrapheme } from '@task-manager/shared';
import * as svc from '../services/contexts';
import { requireUserId } from '../middleware/auth';

const router = Router();

// #RRGGBB — the only form the palette emits and the only one the notification
// color→emoji matcher (nearestEmoji) can parse.
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #RRGGBB hex string');

const emojiSchema = z
  .string()
  .trim()
  .max(EMOJI_MAX_LENGTH)
  .refine(isSingleGrapheme, 'Emoji must be a single character');

const createSchema = z.object({
  label: z.string().min(1),
  color: hexColor,
  slug: z.string().optional(),
  excludeFromAll: z.boolean().optional(),
  emoji: emojiSchema.nullish(),
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  color: hexColor.optional(),
  archived: z.boolean().optional(),
  excludeFromAll: z.boolean().optional(),
  emoji: emojiSchema.nullable().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.number().int()).min(1),
});

router.get('/', async (req, res) => {
  res.json(await svc.listContexts(requireUserId(req)));
});

router.post('/', async (req, res) => {
  res.status(201).json(await svc.createContext(requireUserId(req), createSchema.parse(req.body)));
});

router.post('/reorder', async (req, res) => {
  res.json(await svc.reorderContexts(requireUserId(req), reorderSchema.parse(req.body).ids));
});

router.patch('/:id', async (req, res) => {
  res.json(
    await svc.updateContext(
      requireUserId(req),
      Number(req.params.id),
      updateSchema.parse(req.body),
    ),
  );
});

router.delete('/:id', async (req, res) => {
  await svc.deleteContext(requireUserId(req), Number(req.params.id));
  res.status(204).end();
});

export default router;

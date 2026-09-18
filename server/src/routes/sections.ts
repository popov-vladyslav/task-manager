import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/sections';
import { requireUserId } from '../middleware/auth';

const router = Router();

const nameSchema = z.object({ name: z.string().min(1) });
const reorderSchema = z.object({ afterId: z.uuid().nullish(), beforeId: z.uuid().nullish() });

router.get('/', async (req, res) => {
  res.json(await svc.listSections(requireUserId(req)));
});

router.patch('/:id', async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  res.json(await svc.renameSection(requireUserId(req), req.params.id, name));
});

router.post('/:id/reorder', async (req, res) => {
  res.json(
    await svc.reorderSection(requireUserId(req), req.params.id, reorderSchema.parse(req.body)),
  );
});

router.delete('/:id', async (req, res) => {
  await svc.deleteSection(requireUserId(req), req.params.id);
  res.status(204).end();
});

export default router;

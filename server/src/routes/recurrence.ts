import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/recurrence';
import { requireUserId } from '../middleware/auth';

const router = Router();

const moveSchema = z.object({
  occursOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueAt: z.string().min(1),
  scope: z.enum(['occurrence', 'following']),
});

router.post('/:ruleId/move', async (req, res) => {
  const ruleId = z.uuid().parse(req.params.ruleId);
  res.json(await svc.moveOccurrence(requireUserId(req), ruleId, moveSchema.parse(req.body)));
});

export default router;

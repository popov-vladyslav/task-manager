import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/settings';
import { requireUserId } from '../middleware/auth';

const router = Router();

const updateSchema = z.object({ notificationsEnabled: z.boolean() });

router.get('/', async (req, res) => {
  res.json({ notificationsEnabled: await svc.notificationsEnabled(requireUserId(req)) });
});

router.patch('/', async (req, res) => {
  const { notificationsEnabled } = updateSchema.parse(req.body);
  await svc.setNotificationsEnabled(requireUserId(req), notificationsEnabled);
  res.json({ notificationsEnabled });
});

export default router;

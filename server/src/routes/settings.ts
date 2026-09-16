import { Router } from 'express';
import { z } from 'zod';
import { LOCALES } from '@task-manager/shared';
import * as svc from '../services/settings';
import { requireUserId } from '../middleware/auth';

const router = Router();

const updateSchema = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    language: z.enum(LOCALES).optional(),
  })
  .refine((v) => v.notificationsEnabled !== undefined || v.language !== undefined, {
    message: 'Nothing to update',
  });

router.get('/', async (req, res) => {
  res.json(await svc.getSettings(requireUserId(req)));
});

router.patch('/', async (req, res) => {
  const userId = requireUserId(req);
  const patch = updateSchema.parse(req.body);
  if (patch.notificationsEnabled !== undefined) {
    await svc.setNotificationsEnabled(userId, patch.notificationsEnabled);
  }
  if (patch.language !== undefined) await svc.setLanguage(userId, patch.language);
  res.json(await svc.getSettings(userId));
});

export default router;

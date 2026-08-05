import { Router } from 'express';
import { z } from 'zod';
import { registerPushToken } from '../services/push';
import { requireUserId } from '../middleware/auth';

const router = Router();

// POST /api/push/register { token, device? }
router.post('/register', async (req, res) => {
  const { token, device } = z
    .object({ token: z.string().min(1), device: z.string().optional() })
    .parse(req.body);
  await registerPushToken(requireUserId(req), token, device);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { registerPushToken } from '../services/push';

const router = Router();

// POST /api/push/register { token, device? }
router.post('/register', async (req, res) => {
  const { token, device } = z
    .object({ token: z.string().min(1), device: z.string().optional() })
    .parse(req.body);
  await registerPushToken(token, device);
  res.json({ ok: true });
});

export default router;

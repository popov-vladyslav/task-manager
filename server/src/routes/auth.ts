import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/auth';

const router = Router();

router.post('/magic-link', async (req, res) => {
  const { email, platform } = z
    .object({ email: z.email(), platform: z.string().optional() })
    .parse(req.body);
  await svc.requestMagicLink(email, platform);
  res.json({ ok: true });
});

router.post('/verify', async (req, res) => {
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
  res.json(await svc.verifyMagicLink(token));
});

router.post('/refresh', async (req, res) => {
  const { refresh } = z.object({ refresh: z.string().min(1) }).parse(req.body);
  res.json(await svc.refresh(refresh));
});

export default router;

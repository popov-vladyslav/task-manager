import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as svc from '../services/auth';

const router = Router();

// Single-user, owner-gated app: brute-forcing the 256-bit tokens is infeasible, so
// these limits are mainly a guard against mailbox spam and accidental request floods.
const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/magic-link', magicLinkLimiter, async (req, res) => {
  const { email, platform } = z
    .object({ email: z.email(), platform: z.string().optional() })
    .parse(req.body);
  await svc.requestMagicLink(email, platform);
  res.json({ ok: true });
});

router.post('/verify', authLimiter, async (req, res) => {
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
  res.json(await svc.verifyMagicLink(token));
});

router.post('/refresh', authLimiter, async (req, res) => {
  const { refresh } = z.object({ refresh: z.string().min(1) }).parse(req.body);
  res.json(await svc.refresh(refresh));
});

export default router;

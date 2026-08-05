import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as svc from '../services/auth';
import { requireAuth, requireUserId } from '../middleware/auth';

const router = Router();

// Sign-up is open, so this endpoint can be pointed at anyone's mailbox. Limit
// per IP *and* per email address: an IP limit alone lets a distributed caller
// spam one victim, and an email limit alone lets one host enumerate many.
const codeLimiterByIp = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const codeLimiterByEmail = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    String((req.body as { email?: string })?.email ?? '')
      .trim()
      .toLowerCase(),
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/magic-link', codeLimiterByIp, codeLimiterByEmail, async (req, res) => {
  const { email, platform } = z
    .object({ email: z.email(), platform: z.string().optional() })
    .parse(req.body);
  await svc.requestLoginCode(email, platform);
  // Always ok: whether an account exists must not be observable here.
  res.json({ ok: true });
});

router.post('/verify', authLimiter, async (req, res) => {
  const { token, device } = z
    .object({ token: z.string().min(1), device: z.string().optional() })
    .parse(req.body);
  res.json(await svc.verifyLoginCode(token, device));
});

// Rotates: the response carries a NEW refresh token and the presented one stops
// working, so the client must persist what it gets back.
router.post('/refresh', authLimiter, async (req, res) => {
  const { refresh } = z.object({ refresh: z.string().min(1) }).parse(req.body);
  res.json(await svc.refresh(refresh));
});

router.post('/signout', authLimiter, async (req, res) => {
  const { refresh } = z.object({ refresh: z.string().min(1) }).parse(req.body);
  await svc.signOut(refresh);
  res.status(204).end();
});

router.post('/signout-all', requireAuth, async (req, res) => {
  await svc.signOutAll(requireUserId(req));
  res.status(204).end();
});

export default router;

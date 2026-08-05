import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/account';
import { requireUserId } from '../middleware/auth';
import { badRequest } from '../lib/errors';

const router = Router();

const confirmSchema = z.object({ confirm: z.string().optional() });

// GET /api/account — who am I? Used for "Signed in as …".
router.get('/', async (req, res) => {
  res.json(await svc.getAccount(requireUserId(req)));
});

// DELETE /api/account { confirm: 'DELETE' } — irreversible. The literal guard
// mirrors the existing reset endpoint (routes/data.ts) so the two destructive
// actions in the API behave the same way; the UI asks first as well, but the
// API must not delete an account on a bare request either.
router.delete('/', async (req, res) => {
  const { confirm } = confirmSchema.parse(req.body ?? {});
  if (confirm !== 'DELETE') {
    throw badRequest("Send { confirm: 'DELETE' } to permanently delete your account.");
  }
  await svc.deleteAccount(requireUserId(req));
  res.status(204).end();
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/data';
import { badRequest } from '../lib/errors';

const router = Router();

const resetSchema = z.object({ confirm: z.string() });

// DELETE /api/data { confirm: 'RESET' } — wipes user content (keeps contexts,
// settings, auth). The literal 'RESET' guard mirrors tech_spec §3.
router.delete('/', async (req, res) => {
  const { confirm } = resetSchema.parse(req.body ?? {});
  if (confirm !== 'RESET') throw badRequest("Send { confirm: 'RESET' } to wipe data.");
  await svc.resetData();
  res.status(204).end();
});

export default router;

import { Router } from 'express';
import * as svc from '../services/summary';
import { requireUserId } from '../middleware/auth';

const router = Router();

// Unfinished ordinary tasks from before today, bucketed for the morning summary.
// Acting on them reuses the normal task endpoints (PATCH /api/tasks/:id with a
// new due_at, or null to drop the schedule) — no bespoke mutation here.
router.get('/morning', async (req, res) => {
  res.json(await svc.getMorningSummary(requireUserId(req)));
});

export default router;

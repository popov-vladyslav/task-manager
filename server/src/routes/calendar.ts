import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/calendar';
import { requireUserId } from '../middleware/auth';

const router = Router();

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  // Opt-in: projected occurrences are only worth their cost on the day/3-day/
  // week views, and the month view asks for a window too long to project.
  ghosts: z.enum(['true', 'false']).optional(),
});

router.get('/', async (req, res) => {
  const { from, to, ghosts } = querySchema.parse(req.query);
  res.json(await svc.getCalendar(requireUserId(req), from, to, { ghosts: ghosts === 'true' }));
});

export default router;

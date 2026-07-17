import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/calendar';

const router = Router();

const querySchema = z.object({ from: z.string().min(1), to: z.string().min(1) });

router.get('/', async (req, res) => {
  const { from, to } = querySchema.parse(req.query);
  res.json(await svc.getCalendar(from, to));
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/timer';

const router = Router();

const startSchema = z.object({ taskId: z.string().min(1) });

// Current running timer (or null).
router.get('/', async (_req, res) => {
  res.json(await svc.getActiveTimer());
});

router.post('/start', async (req, res) => {
  res.status(201).json(await svc.startTimer(startSchema.parse(req.body).taskId));
});

router.post('/stop', async (_req, res) => {
  res.json(await svc.stopTimer());
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import * as svc from '../services/timer';
import { requireUserId } from '../middleware/auth';

const router = Router();

const startSchema = z.object({ taskId: z.string().min(1) });

// Current running timer (or null).
router.get('/', async (req, res) => {
  res.json(await svc.getActiveTimer(requireUserId(req)));
});

router.post('/start', async (req, res) => {
  res.status(201).json(await svc.startTimer(requireUserId(req), startSchema.parse(req.body).taskId));
});

router.post('/stop', async (req, res) => {
  res.json(await svc.stopTimer(requireUserId(req)));
});

export default router;

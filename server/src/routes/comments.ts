import { Router } from 'express';
import * as svc from '../services/comments';

const router = Router();

// DELETE /api/comments/:id
router.delete('/:id', async (req, res) => {
  await svc.deleteComment(req.params.id);
  res.status(204).end();
});

export default router;

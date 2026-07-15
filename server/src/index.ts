import express from 'express';
import cors from 'cors';
import { env } from './env';
import authRouter from './routes/auth';
import contextsRouter from './routes/contexts';
import tasksRouter from './routes/tasks';
import commentsRouter from './routes/comments';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Public auth endpoints.
app.use('/auth', authRouter);

// Everything under /api requires a valid JWT.
app.use('/api/contexts', requireAuth, contextsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/comments', requireAuth, commentsRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

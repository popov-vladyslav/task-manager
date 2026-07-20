import express from 'express';
import cors from 'cors';
import { env } from './env';
import authRouter from './routes/auth';
import contextsRouter from './routes/contexts';
import tasksRouter from './routes/tasks';
import commentsRouter from './routes/comments';
import timerRouter from './routes/timer';
import calendarRouter from './routes/calendar';
import pushRouter from './routes/push';
import mcpRouter from './routes/mcp';
import { startScheduler } from './scheduler';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { oauthProvider, approveHandler } from './mcp/oauth';
import dataRouter from './routes/data';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';

// Safety net: a stray async rejection (e.g. a background job hitting a transient
// DB/network error) should be logged, not crash the always-on service.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});

const app = express();
// Behind Render's proxy: trust the first hop so req.ip / rate-limiting see the real client.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // OAuth /token + /oauth/approve

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// OAuth authorization server for the claude.ai MCP connector (only when configured).
// Serves /.well-known/oauth-*, /authorize, /token, /register at the app root.
if (env.MCP_TOKEN) {
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(env.PUBLIC_URL),
      resourceName: 'Log Task Manager',
    }),
  );
  app.post('/oauth/approve', approveHandler);
}

// Public auth endpoints.
app.use('/auth', authRouter);

// Everything under /api requires a valid JWT.
app.use('/api/contexts', requireAuth, contextsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/comments', requireAuth, commentsRouter);
app.use('/api/timer', requireAuth, timerRouter);
app.use('/api/calendar', requireAuth, calendarRouter);
app.use('/api/push', requireAuth, pushRouter);
app.use('/api/data', requireAuth, dataRouter);

// MCP server for the claude.ai connector (Bearer MCP_TOKEN, not JWT).
app.use('/mcp', mcpRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  startScheduler();
});

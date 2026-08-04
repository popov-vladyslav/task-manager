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
import mcpTokensRouter from './routes/mcp-tokens';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { oauthProvider, approveHandler } from './mcp/oauth';
import dataRouter from './routes/data';
import summaryRouter from './routes/summary';
import { requireAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';

export function createApp(): express.Express {
  const app = express();
  // Behind Render's proxy: trust the first hop so req.ip / rate-limiting see the real client.
  app.set('trust proxy', 1);
  // CORS allowlist (env ALLOWED_ORIGINS). Requests with no Origin header — the
  // native app, curl, the MCP connector (server-to-server) — aren't browser CORS
  // and are always allowed; browser requests must come from an allowlisted origin.
  const allowedOrigins = new Set(env.ALLOWED_ORIGINS);
  app.use(
    cors({
      origin(origin, cb) {
        // Allowlisted (or no Origin) → reflect it; otherwise omit the CORS header so
        // the browser blocks the response, without 500-ing the request.
        cb(null, !origin || allowedOrigins.has(origin));
      },
    }),
  );
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
        issuerUrl: new URL(env.MCP_BASE_URL),
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
  app.use('/api/summary', requireAuth, summaryRouter);
  app.use('/api/mcp-token', requireAuth, mcpTokensRouter);

  // MCP server for the claude.ai connector (Bearer MCP_TOKEN, not JWT).
  app.use('/mcp', mcpRouter);

  app.use(errorHandler);

  return app;
}

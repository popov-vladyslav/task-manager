import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { env } from '../env';
import { buildMcpServer } from '../mcp/build-server';
import { oauthProvider } from '../mcp/oauth';

const router = Router();

// OAuth access-token auth for the claude.ai connector; on 401 it emits a
// WWW-Authenticate challenge pointing at the protected-resource metadata.
const oauthBearer = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl: `${env.MCP_BASE_URL}/.well-known/oauth-protected-resource`,
});

router.use((req, res, next) => {
  if (!env.MCP_TOKEN) {
    res.status(503).json({ error: 'MCP not configured' });
    return;
  }
  // Static-token bypass for header-capable dev clients (Claude Code, Cursor, scripts).
  if (req.header('authorization') === `Bearer ${env.MCP_TOKEN}`) {
    next();
    return;
  }
  // Otherwise require an OAuth access token (claude.ai web/mobile connectors).
  oauthBearer(req, res, next);
});

router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

// Stateless Streamable HTTP: a fresh server + transport per request.
router.post('/', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close();
  });
  const server = buildMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default router;

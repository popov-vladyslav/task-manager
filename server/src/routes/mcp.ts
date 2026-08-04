import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { env } from '../env';
import { buildMcpServer } from '../mcp/build-server';
import { getOwnerUserId } from '../services/users';
import { resolveToken } from '../services/mcp-tokens';
import { oauthProvider } from '../mcp/oauth';

const router = Router();

// OAuth access-token auth for the claude.ai connector; on 401 it emits a
// WWW-Authenticate challenge pointing at the protected-resource metadata.
const oauthBearer = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl: `${env.MCP_BASE_URL}/.well-known/oauth-protected-resource`,
});

// Every request resolves to exactly one account before any tool runs. Three
// ways in, one outcome: req.mcpUserId.
//
// Note /mcp is no longer gated on MCP_TOKEN being set — personal tokens work
// regardless. Only the legacy branch depends on it.
router.use((req, res, next) => {
  void (async () => {
    const header = req.header('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;

    // 1. A personal MCP token — the primary path for header-capable clients
    //    (Claude Code, Cursor, scripts).
    if (bearer) {
      const resolved = await resolveToken(bearer);
      if (resolved) {
        req.mcpUserId = resolved.userId;
        next();
        return;
      }
    }

    // 2. Legacy shared static token, owner-scoped. Kept working so the prod
    //    connector keeps running until it is cut over to a personal token; drop
    //    this branch (and MCP_TOKEN) afterwards.
    if (env.MCP_TOKEN && bearer === env.MCP_TOKEN) {
      req.mcpUserId = await getOwnerUserId();
      next();
      return;
    }

    // 3. OAuth access token (claude.ai web/mobile connectors). The verifier
    //    resolves the account and re-checks that the token behind it is live.
    oauthBearer(req, res, next);
  })().catch(next);
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
  // Legacy static token / current OAuth flow are both owner-scoped until the
  // per-user token cutover.
  // Set by the middleware above: either directly, or by the OAuth verifier via
  // req.auth.extra.userId.
  const userId = req.mcpUserId ?? (req.auth?.extra?.userId as string | undefined);
  if (!userId) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  const server = buildMcpServer(userId);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default router;

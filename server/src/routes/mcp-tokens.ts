import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as svc from '../services/mcp-tokens';
import { requireUserId } from '../middleware/auth';

const router = Router();

// Every issue sends an email, so this is both abuse protection and mailbox
// protection — a user hammering "regenerate" would otherwise spam themselves.
//
// Keyed by ACCOUNT, not by IP (the library default): the route is behind
// requireAuth so the user is always known, and an IP key would let people
// sharing an address — an office, a NAT, a household — exhaust each other's
// budget and block a stranger's token generation.
const issueLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => requireUserId(req),
});

// Metadata only: created / last used. Null when the account has no live token.
router.get('/', async (req, res) => {
  res.json(await svc.getTokenMetadata(requireUserId(req)));
});

// Issue or regenerate. The response carries metadata ONLY — the token itself
// goes to the account's verified address and nowhere else.
router.post('/', issueLimiter, async (req, res) => {
  res.status(201).json(await svc.issueToken(requireUserId(req)));
});

router.delete('/', async (req, res) => {
  await svc.revokeToken(requireUserId(req));
  res.status(204).end();
});

export default router;

import type { NextFunction, Request, Response } from 'express';
import { verifyAccess } from '../lib/jwt';
import { unauthorized } from '../lib/errors';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing bearer token'));
    return;
  }
  try {
    // Rejects anything that is not an app access token — notably MCP OAuth
    // tokens, which are signed with the same secret (see lib/jwt.ts).
    const { sub } = verifyAccess(header.slice(7));
    req.userId = sub;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

// Reads the id requireAuth resolved. Throwing rather than returning undefined
// keeps callers honest: a route that forgot requireAuth fails loudly instead of
// silently querying with `undefined` as the owner.
export function requireUserId(req: Request): string {
  if (!req.userId) throw unauthorized('Not authenticated');
  return req.userId;
}

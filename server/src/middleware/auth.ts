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
    verifyAccess(header.slice(7));
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

import jwt from 'jsonwebtoken';
import { env } from '../env';

const ACCESS_TTL = '30d';

export interface JwtPayload {
  sub: string;
}

export function signAccess(sub: string): string {
  return jwt.sign({ sub }, env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function verifyAccess(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

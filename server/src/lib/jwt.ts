import jwt from 'jsonwebtoken';
import { env } from '../env';

// Short-lived: the client silently refreshes on 401 (app/src/lib/api.ts), and a
// short window is what makes a revoked session or a deleted account take effect
// quickly without a database lookup on every request.
const ACCESS_TTL = '15m';

// App access tokens and MCP OAuth tokens are signed with the SAME secret and are
// told apart only by this claim. Without checking it, an MCP token — which the
// user hands to a third-party AI client — would authenticate as a full app
// session. Always verify the type, never just the signature.
const APP_ACCESS_TYP = 'app_access';

export interface JwtPayload {
  /** The user's id. */
  sub: string;
  typ: string;
}

export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId, typ: APP_ACCESS_TYP }, env.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

export function verifyAccess(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  if (payload.typ !== APP_ACCESS_TYP) throw new Error('Not an app access token');
  if (!payload.sub) throw new Error('Token carries no subject');
  return payload;
}

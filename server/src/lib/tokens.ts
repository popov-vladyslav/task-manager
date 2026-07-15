import crypto from 'node:crypto';

export const randomToken = (): string => crypto.randomBytes(32).toString('base64url');

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

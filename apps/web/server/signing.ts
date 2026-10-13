/**
 * Short-lived signed tokens for file access and deck render (replaces S3
 * presigned URLs). HMAC-SHA256 over "key|exp" with RENDER_TOKEN_SECRET.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.RENDER_TOKEN_SECRET;
  if (!s) throw new Error('RENDER_TOKEN_SECRET is not set');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Create a token granting access to `key` for `ttlSeconds` (default 15 min). */
export function signFileToken(key: string, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${key}|${exp}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

/** Verify a token and return the key if valid and unexpired, else null. */
export function verifyFileToken(token: string): string | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const payload = Buffer.from(body, 'base64url').toString('utf8');
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [key, expStr] = payload.split('|');
  if (!key || !expStr) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return key;
}

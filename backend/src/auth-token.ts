import { createHmac, timingSafeEqual } from 'node:crypto';
import { appConfig } from './config.js';

interface TokenPayload {
  sub: string;
  exp: number;
}

function encode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', appConfig.sessionSecret)
    .update(value)
    .digest('base64url');
}

export function createSessionToken(userId: string): string {
  if (!appConfig.sessionSecret) {
    throw new Error('SESSION_SECRET is not set');
  }

  const payload: TokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(
  token: string | undefined
): TokenPayload | null {
  if (!token || !appConfig.sessionSecret) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

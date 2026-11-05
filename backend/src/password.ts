import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null
): Promise<boolean> {
  if (!storedHash) return false;

  const [algorithm, salt, expectedHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

export function safeStringEqual(input: string, expected: string): boolean {
  const actualBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

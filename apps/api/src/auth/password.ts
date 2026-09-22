import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP's 32 MiB scrypt profile keeps hashing memory bounded beside the controller.
let active = 0;
export class PasswordBusyError extends Error {}
async function derive(password: string, salt: string): Promise<Buffer> {
  if (active >= 2) throw new PasswordBusyError('Please try again shortly.');
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 },
        (error, key) => error ? reject(error) : resolve(key));
    });
  } finally { active--; }
}
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && [...value].length >= 15 && [...value].length <= 128;
}
export function normalizeLogin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(normalized) ? normalized : null;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-32768-8-3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string | null) {
  const parts = encoded?.split('$');
  const valid = parts?.length === 3 && parts[0] === 'scrypt-32768-8-3'
    && /^[a-f0-9]{32}$/.test(parts[1]!) && /^[a-f0-9]{64}$/.test(parts[2]!);
  // Unknown users take the same expensive path; never authenticate the dummy hash.
  const actual = await derive(password, valid ? parts[1]! : '0'.repeat(32));
  const expected = Buffer.from(valid ? parts[2]! : '0'.repeat(64), 'hex');
  return timingSafeEqual(actual, expected) && Boolean(valid);
}

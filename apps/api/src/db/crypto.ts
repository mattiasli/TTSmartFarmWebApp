import { createHash, randomBytes } from 'node:crypto';

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function requestHash(payload: unknown) {
  return sha256(JSON.stringify(payload));
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

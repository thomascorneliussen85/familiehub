import { randomBytes, randomInt, createHash } from 'node:crypto';

export function generateApiKey() {
  return randomBytes(24).toString('base64url');
}

export function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export function generatePairingCode() {
  return String(randomInt(100000, 1000000));
}

export function generateId() {
  return randomBytes(12).toString('base64url');
}

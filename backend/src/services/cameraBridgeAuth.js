import { randomBytes, createHash } from 'node:crypto';

// Samme mønster som relay/src/crypto.js: broen får en id + en engangsvist
// API-nøkkel, kun hashen (sha256) lagres i databasen.
export function generateBridgeId() {
  return randomBytes(9).toString('base64url');
}

export function generateBridgeApiKey() {
  return randomBytes(24).toString('base64url');
}

export function hashBridgeApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

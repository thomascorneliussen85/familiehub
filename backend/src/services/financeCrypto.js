import crypto from 'crypto';
import { config } from '../config.js';

// Krypterer Claude-nøkkel og Enable Banking-PEM før de lagres i
// finance_config (aldri i klartekst i databasen eller repoet). AES-256-GCM
// med en fersk, tilfeldig IV per kall – lagret format er
// "<iv-hex>:<authTag-hex>:<ciphertext-hex>" slik at alt som trengs for å
// dekryptere ligger i selve strengen, bortsett fra masternøkkelen.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  const hex = config.financeEncryptionKey;
  if (!hex) {
    throw new Error(
      'FINANCE_ENCRYPTION_KEY er ikke satt – kan ikke kryptere/dekryptere økonomidata. Generer én med: openssl rand -hex 32'
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('FINANCE_ENCRYPTION_KEY må være en 32-byte hex-streng (64 tegn) – generer med: openssl rand -hex 32');
  }
  return key;
}

export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(stored) {
  if (!stored) return null;
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) return null;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

export function isFinanceEncryptionConfigured() {
  return Boolean(config.financeEncryptionKey);
}

/**
 * lib/encryption.ts
 * -----------------
 * AES-256-GCM symmetric encryption/decryption for storing sensitive secrets
 * (e.g., per-tenant Razorpay Key Secret) in the database.
 *
 * Storage format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 *
 * SECURITY CONTRACT:
 *  - This file MUST only ever be imported on the server side.
 *  - The ENCRYPTION_KEY must be a 32-byte (64-char hex) secret stored in .env.
 *  - The authTag provides authenticated encryption — tampered ciphertext will throw.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes
const IV_LENGTH  = 12; // bytes (96-bit is recommended for GCM)
const TAG_LENGTH = 16; // bytes

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw || raw.length !== KEY_LENGTH * 2) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[encryption] ENCRYPTION_KEY is missing or invalid. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    // Development fallback — deterministic but obvious
    console.warn(
      '[encryption] WARNING: Using insecure dev-fallback ENCRYPTION_KEY. ' +
      'Set ENCRYPTION_KEY in .env before going to production.'
    );
    return Buffer.alloc(KEY_LENGTH, 'dev-fallback-key-do-not-use-in-prod');
  }

  return Buffer.from(raw, 'hex');
}

/**
 * Encrypts a plaintext string.
 * @returns A colon-separated hex string: `iv:authTag:ciphertext`
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  }) as crypto.CipherGCM;

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a string produced by `encrypt()`.
 * @throws If the encoded string is malformed or the authTag fails (tamper detection).
 */
export function decrypt(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('[encryption] Invalid encoded format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key        = getKey();
  const iv         = Buffer.from(ivHex, 'hex');
  const authTag    = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  }) as crypto.DecipherGCM;

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

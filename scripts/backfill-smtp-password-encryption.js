#!/usr/bin/env node

/**
 * Re-encrypt legacy plaintext SMTP passwords in BusinessProfile rows.
 *
 * Usage:
 *   node scripts/backfill-smtp-password-encryption.js
 *   node scripts/backfill-smtp-password-encryption.js --dry-run
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const url = new URL(connectionString);
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL DATABASE_URL required');
const prisma = new PrismaClient({ adapter: new PrismaPg({
  connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
}) });

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw || raw.length !== KEY_LENGTH * 2) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[backfill-smtp] ENCRYPTION_KEY is missing or invalid (expected 64-char hex).'
      );
    }
    console.warn(
      '[backfill-smtp] WARNING: Using insecure dev-fallback ENCRYPTION_KEY.'
    );
    return Buffer.alloc(KEY_LENGTH, 'dev-fallback-key-do-not-use-in-prod');
  }

  return Buffer.from(raw, 'hex');
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encoded) {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encoded format. Expected iv:authTag:ciphertext.');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const profiles = await prisma.businessProfile.findMany({
    where: {
      smtpPassword: {
        not: null,
      },
    },
    select: {
      id: true,
      workspaceId: true,
      smtpPassword: true,
    },
  });

  let alreadyEncrypted = 0;
  let toBackfill = 0;
  let updated = 0;

  for (const profile of profiles) {
    const smtpPassword = (profile.smtpPassword || '').trim();
    if (!smtpPassword) continue;

    try {
      decrypt(smtpPassword);
      alreadyEncrypted++;
      continue;
    } catch {
      toBackfill++;
    }

    if (dryRun) continue;

    const encryptedPassword = encrypt(smtpPassword);
    await prisma.businessProfile.update({
      where: { id: profile.id },
      data: { smtpPassword: encryptedPassword },
    });
    updated++;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned: profiles.length,
        alreadyEncrypted,
        legacyPlaintextDetected: toBackfill,
        updated,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('[backfill-smtp] Fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

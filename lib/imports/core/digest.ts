import crypto from 'crypto';

export function computeImportDigest(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

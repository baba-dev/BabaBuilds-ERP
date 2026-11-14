import 'server-only';
import crypto from 'node:crypto';

export const hashShareToken = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');
/** A 256-bit secret for a link. Only its hash is stored, so a leaked database cannot reveal working links. */
export const newShareSecret = () => crypto.randomBytes(32).toString('base64url');
export const SHARE_MAX_DAYS = 90;
export const SHARE_ACTIVE_LIMIT = 50;

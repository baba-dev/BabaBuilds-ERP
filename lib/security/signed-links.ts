import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

function getSecret() {
  return process.env.PUBLIC_ASSET_SIGNING_SECRET || process.env.NEXTAUTH_SECRET || '';
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(input: string) {
  const secret = getSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export type SignedAssetPayload = {
  workspaceId: string;
  path: string;
  exp: number;
};

export function createSignedAssetToken(workspaceId: string, path: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const payload: SignedAssetPayload = {
    workspaceId,
    path,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifySignedAssetToken(token: string):
  | { ok: true; payload: SignedAssetPayload }
  | { ok: false; reason: 'invalid' | 'expired' } {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'invalid' };

  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) return { ok: false, reason: 'invalid' };

  const expected = sign(payloadEncoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!expected || actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, reason: 'invalid' };
  }

  let payload: SignedAssetPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded));
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (!payload.workspaceId || !payload.path || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'invalid' };
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload };
}

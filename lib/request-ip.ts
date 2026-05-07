export type HeadersOrRequest = Headers | Request | { headers: Headers };

const TRUSTED_CLIENT_IP_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
] as const;

/**
 * Best-effort client IP extraction from common reverse-proxy headers.
 *
 * IMPORTANT: These headers are user-spoofable unless the origin only accepts
 * traffic from Cloudflare or another trusted reverse proxy that overwrites
 * client IP headers before forwarding requests to the app.
 */
export function getClientIp(headersOrRequest: HeadersOrRequest): string {
  const headers = headersOrRequest instanceof Headers ? headersOrRequest : headersOrRequest.headers;

  for (const header of TRUSTED_CLIENT_IP_HEADERS) {
    const ip = normalizeIp(headers.get(header));
    if (ip) return ip;
  }

  return 'unknown';
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;

  let candidate = value.split(',')[0]?.trim();
  if (!candidate) return null;

  candidate = candidate.replace(/^"(.+)"$/, '$1').trim();
  if (!candidate) return null;

  if (candidate.startsWith('[')) {
    const bracketed = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed?.[1]) return normalizeIpLiteral(bracketed[1]);
    return null;
  }

  const singleColonPort = candidate.match(/^([^:\s]+):(\d+)$/);
  if (singleColonPort?.[1] && isLikelyIpv4(singleColonPort[1])) {
    candidate = singleColonPort[1];
  }

  return normalizeIpLiteral(candidate);
}

function normalizeIpLiteral(value: string): string | null {
  const ip = value.trim().toLowerCase();
  if (!ip || /\s/.test(ip)) return null;

  if (isLikelyIpv4(ip)) return ip;
  if (isLikelyIpv6(ip)) return ip;

  return null;
}

function isLikelyIpv4(value: string): boolean {
  const octets = value.split('.');
  if (octets.length !== 4) return false;

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const parsed = Number(octet);
    return parsed >= 0 && parsed <= 255;
  });
}

function isLikelyIpv6(value: string): boolean {
  if (!value.includes(':') || !/^[0-9a-f:.%]+$/.test(value)) return false;

  const zoneIndex = value.indexOf('%');
  const withoutZone = zoneIndex >= 0 ? value.slice(0, zoneIndex) : value;
  const hasCompression = withoutZone.includes('::');
  const doubleColonMatches = withoutZone.match(/::/g)?.length ?? 0;
  if (doubleColonMatches > 1) return false;

  const parts = withoutZone.split(':');
  if (parts.length > 8 || (!hasCompression && parts.some((part) => part === ''))) return false;

  let groupCount = 0;
  for (const [index, part] of parts.entries()) {
    if (part === '') continue;

    if (isLikelyIpv4(part)) {
      if (index !== parts.length - 1) return false;
      groupCount += 2;
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(part)) return false;
    groupCount += 1;
  }

  return hasCompression ? groupCount < 8 : groupCount === 8;
}

import 'server-only';

import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateHostname(hostname: string) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (['localhost', '0.0.0.0', '::', '::1'].includes(h) || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  return isPrivateOrReservedAddress(h);
}

function ipv4ToNumber(address: string) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return parts.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

function inIpv4Range(address: string, base: string, maskBits: number) {
  const value = ipv4ToNumber(address);
  const baseValue = ipv4ToNumber(base);
  if (value === null || baseValue === null) return false;
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

// Check IPv6 ranges by CIDR, not by string prefix: fe90::/10 and feb0::/10
// are link-local too, and IPv4-mapped hex addresses must not bypass checks.
const blockedV6 = new net.BlockList();
for (const [prefix, bits] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96],
  ['fe80::', 10], ['fc00::', 7], ['ff00::', 8],
  ['2001:db8::', 32],
] as const) blockedV6.addSubnet(prefix, bits, 'ipv6');

export function isPrivateOrReservedAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const candidate = mappedIpv4 ?? normalized;
  const ipVersion = net.isIP(candidate);

  if (ipVersion === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([base, bits]) => inIpv4Range(candidate, String(base), Number(bits)));
  }

  if (ipVersion === 6) {
    return blockedV6.check(normalized, 'ipv6');
  }

  return false;
}

export function validateMailBillingUrl(rawUrl: string, env = process.env.NODE_ENV) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are supported');
  if (url.username || url.password) throw new Error('Credentials in server URLs are not allowed');
  if (env === 'production') {
    if (url.protocol !== 'https:') throw new Error('HTTPS is required in production');
    if (isPrivateHostname(url.hostname)) throw new Error('Private, loopback, and link-local hosts are blocked in production');
  }
  return url;
}

export async function validateMailBillingUrlForFetch(rawUrl: string, env = process.env.NODE_ENV) {
  const url = validateMailBillingUrl(rawUrl, env);
  if (env === 'production' && net.isIP(url.hostname) === 0) {
    const resolvedAddresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (resolvedAddresses.some((entry) => isPrivateOrReservedAddress(entry.address))) {
      throw new Error('Private, loopback, and link-local hosts are blocked in production');
    }
  }
  return url;
}

/**
 * URL of a Mail-in-a-Box admin API path. The API lives under /admin, so a base URL of just the host gets /admin added;
 * a base that already has a path is kept. The path is appended (never resolved from the host root, which would drop /admin).
 */
export function miabApiUrl(base: URL, path: string): URL {
  const root = new URL(base.toString());
  root.search = '';
  root.hash = '';
  if (root.pathname === '' || root.pathname === '/') root.pathname = '/admin/';
  else if (!root.pathname.endsWith('/')) root.pathname = `${root.pathname}/`;
  return new URL(path.replace(/^\/+/, ''), root);
}

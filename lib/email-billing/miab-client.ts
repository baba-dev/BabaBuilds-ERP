import 'server-only';

import dns from 'node:dns/promises';
import net from 'node:net';

export type MailBillingAccessMode = 'READ_ONLY_ADAPTER' | 'DIRECT_MIAB_API';
export type MailBillingInventory = {
  serverHostname?: string;
  syncedAt: string;
  domains: Array<{
    domain: string;
    aliasesCount?: number;
    mailboxes: Array<{
      email: string;
      quotaMb?: number | null;
      isAdmin?: boolean;
      status?: 'ACTIVE' | 'ARCHIVED' | 'REMOVED';
      raw?: unknown;
    }>;
  }>;
};

const READ_ENDPOINTS = ['/mail/domains', '/mail/users?format=json', '/mail/aliases?format=json'] as const;
const REQUIRED_DIRECT_ENDPOINTS = ['/mail/domains', '/mail/users?format=json'] as const;
const OPTIONAL_DIRECT_ENDPOINT = '/mail/aliases?format=json';

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

function buildAuthHeader(accessMode: MailBillingAccessMode, token?: string): Record<string, string> {
  if (!token) return {};
  if (accessMode === 'DIRECT_MIAB_API') {
    const value = token.startsWith('Basic ') ? token : `Basic ${Buffer.from(token).toString('base64')}`;
    return { Authorization: value };
  }
  return { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` };
}

async function fetchJson(url: URL, accessMode: MailBillingAccessMode, token?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: buildAuthHeader(accessMode, token),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Mail billing source returned ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMailbox(raw: unknown) {
  const m = asRecord(raw);
  const email = String(m.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  const quotaValue = m.quotaMb ?? m.quota_mb;
  return {
    email,
    quotaMb: quotaValue === null || quotaValue === undefined ? null : Number(quotaValue),
    isAdmin: Boolean(m.isAdmin ?? m.admin),
    status: m.status === 'ARCHIVED' || m.status === 'REMOVED' ? (m.status as 'ARCHIVED' | 'REMOVED') : ('ACTIVE' as const),
    raw,
  };
}

function normalizeAdapterInventory(data: unknown): MailBillingInventory {
  const root = asRecord(data);
  return {
    serverHostname: typeof root.serverHostname === 'string' ? root.serverHostname : undefined,
    syncedAt: typeof root.syncedAt === 'string' ? root.syncedAt : new Date().toISOString(),
    domains: asArray(root.domains)
      .map((rawDomain) => {
        const d = asRecord(rawDomain);
        const domain = String(d.domain ?? '').trim().toLowerCase();
        if (!domain) return null;
        return {
          domain,
          aliasesCount: Number(d.aliasesCount ?? 0),
          mailboxes: asArray(d.mailboxes).map(normalizeMailbox).filter((mailbox): mailbox is NonNullable<ReturnType<typeof normalizeMailbox>> => Boolean(mailbox)),
        };
      })
      .filter((domain): domain is NonNullable<typeof domain> => Boolean(domain)),
  };
}

export function getDirectMiabReadEndpoints() {
  return [...READ_ENDPOINTS];
}

function extractDirectDomains(domainsRaw: unknown) {
  if (Array.isArray(domainsRaw)) return domainsRaw.map(String);
  const record = asRecord(domainsRaw);
  if (Array.isArray(record.domains)) return record.domains.map(String);
  return Object.keys(record);
}

function extractDirectUsers(usersRaw: unknown) {
  if (Array.isArray(usersRaw)) return usersRaw;
  const record = asRecord(usersRaw);
  return asArray(record.users);
}

function extractDirectAliases(aliasesRaw: unknown) {
  if (Array.isArray(aliasesRaw)) return aliasesRaw;
  const record = asRecord(aliasesRaw);
  return asArray(record.aliases);
}

async function fetchDirectMiabInventory(base: URL, token?: string): Promise<MailBillingInventory> {
  const [domainsRaw, usersRaw] = await Promise.all(
    REQUIRED_DIRECT_ENDPOINTS.map((ep) => fetchJson(new URL(ep, base), 'DIRECT_MIAB_API', token)),
  );
  const aliasesRaw = await fetchJson(new URL(OPTIONAL_DIRECT_ENDPOINT, base), 'DIRECT_MIAB_API', token).catch(() => []);
  const domainNames = extractDirectDomains(domainsRaw);
  const users = extractDirectUsers(usersRaw);
  const aliases = extractDirectAliases(aliasesRaw);

  const domains = domainNames.map((domain) => {
    const d = String(domain).toLowerCase();
    const mailboxes = users
      .map(normalizeMailbox)
      .filter((mailbox): mailbox is NonNullable<ReturnType<typeof normalizeMailbox>> => Boolean(mailbox))
      .filter((mailbox) => mailbox.email.endsWith(`@${d}`));
    return {
      domain: d,
      aliasesCount: aliases.filter((alias) => {
        const a = asRecord(alias);
        return String(a.address ?? alias).toLowerCase().endsWith(`@${d}`);
      }).length,
      mailboxes,
    };
  });

  return { syncedAt: new Date().toISOString(), domains };
}

export async function fetchMailBillingInventory(opts: {
  baseUrl: string;
  accessMode: MailBillingAccessMode;
  token?: string;
}): Promise<MailBillingInventory> {
  const base = await validateMailBillingUrlForFetch(opts.baseUrl);
  if (opts.accessMode === 'READ_ONLY_ADAPTER') return normalizeAdapterInventory(await fetchJson(base, 'READ_ONLY_ADAPTER', opts.token));
  return fetchDirectMiabInventory(base, opts.token);
}

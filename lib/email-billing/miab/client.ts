import 'server-only';

import { validateMailBillingUrlForFetch } from './guard';
import {
  asRecord,
  extractDirectAliases,
  extractDirectDomains,
  extractDirectUsers,
  normalizeAdapterInventory,
  normalizeMailbox,
  type MailBillingInventory,
} from './normalize';

export type MailBillingAccessMode = 'READ_ONLY_ADAPTER' | 'DIRECT_MIAB_API';

const READ_ENDPOINTS = ['/mail/domains', '/mail/users?format=json', '/mail/aliases?format=json'] as const;
const REQUIRED_DIRECT_ENDPOINTS = ['/mail/domains', '/mail/users?format=json'] as const;
const OPTIONAL_DIRECT_ENDPOINT = '/mail/aliases?format=json';

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

export function getDirectMiabReadEndpoints() {
  return [...READ_ENDPOINTS];
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

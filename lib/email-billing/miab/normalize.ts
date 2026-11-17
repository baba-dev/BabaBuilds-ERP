import 'server-only';

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

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Mail-in-a-Box reports quotas as "0" (unlimited), "500M", "5G", "1T" or a plain number of megabytes. */
export function parseQuotaMb(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mb = unit === 'k' ? n / 1024 : unit === 'g' ? n * 1024 : unit === 't' ? n * 1024 * 1024 : n;
  return Math.round(mb);
}

export function normalizeMailbox(raw: unknown) {
  const m = asRecord(raw);
  const email = String(m.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  const quotaValue = m.quotaMb ?? m.quota_mb ?? m.quota;
  const privileges = asArray(m.privileges).map((p) => String(p).toLowerCase());
  // Mail-in-a-Box marks archived mailboxes (kept on disk, login disabled) as status "inactive".
  const archived = m.status === 'ARCHIVED' || String(m.status ?? '').toLowerCase() === 'inactive';
  return {
    email,
    quotaMb: parseQuotaMb(quotaValue),
    isAdmin: Boolean(m.isAdmin ?? m.admin) || privileges.includes('admin'),
    status: m.status === 'REMOVED' ? ('REMOVED' as const) : archived ? ('ARCHIVED' as const) : ('ACTIVE' as const),
    raw,
  };
}

export function normalizeAdapterInventory(data: unknown): MailBillingInventory {
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

export function extractDirectDomains(domainsRaw: unknown) {
  if (Array.isArray(domainsRaw)) return domainsRaw.map(String);
  const record = asRecord(domainsRaw);
  if (Array.isArray(record.domains)) return record.domains.map(String);
  return Object.keys(record);
}

/** Mail-in-a-Box groups results by domain: [{ domain, users: [...] }]. Accept that shape and a flat list. */
function flattenGrouped(raw: unknown, keys: string[]): unknown[] {
  const rows = Array.isArray(raw) ? raw : asArray(asRecord(raw)[keys[0]]);
  return rows.flatMap((row) => {
    const rec = asRecord(row);
    const nested = keys.map((k) => rec[k]).find((v) => Array.isArray(v));
    return Array.isArray(nested) ? nested : [row];
  });
}

export function extractDirectUsers(usersRaw: unknown) {
  return flattenGrouped(usersRaw, ['users']);
}

export function extractDirectAliases(aliasesRaw: unknown) {
  return flattenGrouped(aliasesRaw, ['aliases', 'alias']);
}

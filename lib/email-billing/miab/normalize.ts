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

export function normalizeMailbox(raw: unknown) {
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

export function extractDirectUsers(usersRaw: unknown) {
  if (Array.isArray(usersRaw)) return usersRaw;
  const record = asRecord(usersRaw);
  return asArray(record.users);
}

export function extractDirectAliases(aliasesRaw: unknown) {
  if (Array.isArray(aliasesRaw)) return aliasesRaw;
  const record = asRecord(aliasesRaw);
  return asArray(record.aliases);
}

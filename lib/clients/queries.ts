import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClientRetainerSummaries } from "@/lib/retainers/client-summary";
import { clientHealth, creditStatus, paymentStats } from "./metrics";
import { duplicateKey, emailKey } from "./names";
import { parseTags, tagLike } from "./tags";

export type ClientMetrics = { invoiceCount: number; billed: number; paid: number; outstanding: number; overdue: number; lastInvoiceAt: string | null };
const ZERO: ClientMetrics = { invoiceCount: 0, billed: 0, paid: 0, outstanding: 0, overdue: 0, lastInvoiceAt: null };
const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Billing roll-up per client in the workspace base currency (invoice total times its booked exchange rate). One grouped query, no N+1. */
export async function clientMetrics(workspaceId: string, ids: string[] | null, now = new Date()): Promise<Map<string, ClientMetrics>> {
  const idFilter = ids ? (ids.length ? Prisma.sql`AND i."clientId" IN (${Prisma.join(ids)})` : Prisma.sql`AND 1 = 0`) : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ clientId: string; invoiceCount: bigint | number; billed: number | null; paid: number | null; outstanding: number | null; overdue: number | null; lastInvoiceAt: Date | number | string | null }>>(Prisma.sql`
    SELECT i."clientId" AS clientId,
      COUNT(*) AS invoiceCount,
      SUM(CAST(i."grandTotal" AS REAL) * CAST(i."exchangeRate" AS REAL)) AS billed,
      SUM(CASE WHEN i."status" = 'PAID' THEN CAST(i."grandTotal" AS REAL) * CAST(i."exchangeRate" AS REAL) ELSE 0 END) AS paid,
      SUM(CASE WHEN i."status" IN ('PENDING','PARTIALLY_PAID') THEN (CAST(i."grandTotal" AS REAL) - CAST(COALESCE(i."amountReceived", 0) AS REAL)) * CAST(i."exchangeRate" AS REAL) ELSE 0 END) AS outstanding,
      SUM(CASE WHEN i."status" IN ('PENDING','PARTIALLY_PAID') AND i."dueDate" IS NOT NULL AND i."dueDate" < ${now} THEN (CAST(i."grandTotal" AS REAL) - CAST(COALESCE(i."amountReceived", 0) AS REAL)) * CAST(i."exchangeRate" AS REAL) ELSE 0 END) AS overdue,
      MAX(i."invoiceDate") AS lastInvoiceAt
    FROM "Invoice" i
    WHERE i."workspaceId" = ${workspaceId} AND i."clientId" IS NOT NULL AND i."status" != 'VOID' AND i."voidedAt" IS NULL ${idFilter}
    GROUP BY i."clientId"`);
  const out = new Map<string, ClientMetrics>();
  for (const r of rows) {
    const last = r.lastInvoiceAt === null ? null : new Date(typeof r.lastInvoiceAt === "bigint" ? Number(r.lastInvoiceAt) : (r.lastInvoiceAt as Date | number | string)).toISOString();
    out.set(r.clientId, { invoiceCount: n(r.invoiceCount), billed: r2(n(r.billed)), paid: r2(n(r.paid)), outstanding: r2(n(r.outstanding)), overdue: r2(n(r.overdue)), lastInvoiceAt: last });
  }
  return out;
}

/** Average days to pay and on-time share from each client's settled invoices (the latest 12 per client). */
async function settledStats(workspaceId: string, ids: string[], defaultTerms: number) {
  const out = new Map<string, ReturnType<typeof paymentStats>>();
  if (!ids.length) return out;
  const rows = await prisma.invoice.findMany({
    where: { workspaceId, clientId: { in: ids }, status: "PAID", dateReceived: { not: null }, voidedAt: null },
    select: { clientId: true, invoiceDate: true, dueDate: true, dateReceived: true, paymentTermsDays: true },
    orderBy: { invoiceDate: "desc" },
    take: Math.min(5000, ids.length * 12),
  });
  const by = new Map<string, Array<{ invoiceDate: Date; dueDate: Date | null; paidAt: Date; termsDays: number }>>();
  for (const r of rows) {
    if (!r.clientId || !r.dateReceived) continue;
    const list = by.get(r.clientId) ?? [];
    if (list.length < 12) list.push({ invoiceDate: r.invoiceDate, dueDate: r.dueDate, paidAt: r.dateReceived, termsDays: r.paymentTermsDays ?? defaultTerms });
    by.set(r.clientId, list);
  }
  for (const [id, list] of by) out.set(id, paymentStats(list));
  return out;
}

export type ClientListQuery = { q?: string; view?: "active" | "vip" | "inactive" | "archived" | "all"; tag?: string; country?: string; owner?: string; sort?: "name" | "recent" | "outstanding" | "revenue" | "activity" | "risk"; page?: number; limit?: number; includeWalkIn?: boolean };

export async function listClients(workspaceId: string, query: ClientListQuery, now = new Date()) {
  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 25)));
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const and: Prisma.ClientWhereInput[] = [];
  if (!query.includeWalkIn) and.push({ isWalkIn: false });
  const view = query.view ?? "active";
  if (view === "archived") and.push({ archivedAt: { not: null } });
  else if (view !== "all") and.push({ archivedAt: null });
  if (view === "vip") and.push({ status: "VIP" });
  if (view === "inactive") and.push({ status: "INACTIVE" });
  if (query.tag) and.push({ tags: { contains: tagLike(query.tag).replaceAll("%", "") } });
  if (query.country) and.push({ countryCode: query.country.toUpperCase() });
  if (query.owner) and.push({ ownerUserId: query.owner });
  const q = query.q?.trim();
  if (q) and.push({ OR: [{ name: { contains: q } }, { email: { contains: q } }, { taxId: { contains: q.toUpperCase() } }, { phone: { contains: q } }, { tags: { contains: q.toLowerCase() } }, { contacts: { some: { OR: [{ name: { contains: q } }, { email: { contains: q } }] } } }] });
  const where: Prisma.ClientWhereInput = { workspaceId, AND: and };

  const sort = query.sort ?? "name";
  const dbSort = sort === "name" || sort === "recent";
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } });
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { invoiceTermsDays: true } });
  const defaultTerms = profile?.invoiceTermsDays ?? 7;

  let rows: Array<Awaited<ReturnType<typeof prisma.client.findMany>>[number] & { _contacts: number }>;
  let total: number;
  let metrics: Map<string, ClientMetrics>;
  const include = { _count: { select: { contacts: true } } } as const;

  if (dbSort) {
    const [found, count] = await Promise.all([
      prisma.client.findMany({ where, orderBy: sort === "recent" ? { createdAt: "desc" } : { name: "asc" }, skip: (page - 1) * limit, take: limit, include }),
      prisma.client.count({ where }),
    ]);
    rows = found.map((c) => ({ ...c, _contacts: c._count.contacts }));
    total = count;
    metrics = await clientMetrics(workspaceId, rows.map((r) => r.id), now);
  } else {
    const all = await prisma.client.findMany({ where, include, take: 5000 });
    metrics = await clientMetrics(workspaceId, all.map((c) => c.id), now);
    const m = (id: string) => metrics.get(id) ?? ZERO;
    const key = (c: (typeof all)[number]) => (sort === "outstanding" ? m(c.id).outstanding : sort === "revenue" ? m(c.id).billed : sort === "risk" ? m(c.id).overdue : m(c.id).lastInvoiceAt ? new Date(m(c.id).lastInvoiceAt as string).getTime() : 0);
    all.sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name));
    total = all.length;
    rows = all.slice((page - 1) * limit, page * limit).map((c) => ({ ...c, _contacts: c._count.contacts }));
  }

  const ids = rows.map((r) => r.id);
  const [retainer, stats] = await Promise.all([getClientRetainerSummaries(workspaceId, ids), settledStats(workspaceId, ids, defaultTerms)]);
  const data = rows.map((c) => {
    const m = metrics.get(c.id) ?? ZERO;
    const st = stats.get(c.id) ?? { avgDaysToPay: null, onTimeRate: null, sample: 0 };
    const terms = c.paymentTermsDays ?? defaultTerms;
    const { _count: _unused, _contacts, ...rest } = c as typeof c & { _count?: unknown };
    void _unused;
    return {
      ...rest,
      creditLimit: c.creditLimit === null ? null : Number(c.creditLimit),
      tagList: parseTags(c.tags),
      contactCount: _contacts,
      metrics: m,
      payment: { avgDaysToPay: st.avgDaysToPay, onTimeRate: st.onTimeRate, termsDays: terms },
      health: clientHealth({ invoiceCount: m.invoiceCount, outstanding: m.outstanding, overdue: m.overdue, onTimeRate: st.onTimeRate, avgDaysToPay: st.avgDaysToPay, termsDays: terms }),
      credit: creditStatus(c.creditLimit === null ? null : Number(c.creditLimit), m.outstanding),
      retainerSummary: retainer.get(c.id),
    };
  });
  return { data, meta: { currentPage: page, totalPages: Math.max(1, Math.ceil(total / limit)), totalRecords: total }, currency: ws?.baseCurrency ?? "INR" };
}

/** Header numbers for the whole book (not just the page). */
export async function clientBookSummary(workspaceId: string, now = new Date()) {
  const base: Prisma.ClientWhereInput = { workspaceId, isWalkIn: false, archivedAt: null };
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [total, vip, archived, newThisMonth, metrics, ws] = await Promise.all([
    prisma.client.count({ where: base }),
    prisma.client.count({ where: { ...base, status: "VIP" } }),
    prisma.client.count({ where: { workspaceId, isWalkIn: false, archivedAt: { not: null } } }),
    prisma.client.count({ where: { ...base, createdAt: { gte: monthStart } } }),
    clientMetrics(workspaceId, null, now),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
  ]);
  let outstanding = 0; let overdue = 0; let withOverdue = 0; let billed = 0;
  for (const m of metrics.values()) { outstanding += m.outstanding; overdue += m.overdue; billed += m.billed; if (m.overdue > 0) withOverdue += 1; }
  return { total, vip, archived, newThisMonth, outstanding: r2(outstanding), overdue: r2(overdue), withOverdue, billed: r2(billed), currency: ws?.baseCurrency ?? "INR" };
}

export async function listTags(workspaceId: string): Promise<Array<{ tag: string; count: number }>> {
  const rows = await prisma.client.findMany({ where: { workspaceId, isWalkIn: false, archivedAt: null, tags: { not: "" } }, select: { tags: true }, take: 5000 });
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of parseTags(r.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Clients that look like the same company, grouped, with how much history each carries so the right one can be kept. */
export async function findDuplicateGroups(workspaceId: string) {
  const rows = await prisma.client.findMany({ where: { workspaceId, isWalkIn: false, archivedAt: null }, select: { id: true, name: true, email: true, createdAt: true, _count: { select: { invoices: true, proposals: true, retainers: true } } }, take: 5000 });
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r) as string; parent.set(x, r); return r; };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const r of rows) parent.set(r.id, r.id);
  const seen = new Map<string, string>();
  for (const r of rows) {
    for (const k of [`n:${duplicateKey(r.name)}`, r.email ? `e:${emailKey(r.email)}` : ""]) {
      if (!k || k === "n:") continue;
      const prev = seen.get(k);
      if (prev) union(prev, r.id); else seen.set(k, r.id);
    }
  }
  const groups = new Map<string, typeof rows>();
  for (const r of rows) { const g = find(r.id); groups.set(g, [...(groups.get(g) ?? []), r]); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => ({
    clients: g.sort((a, b) => b._count.invoices - a._count.invoices || a.createdAt.getTime() - b.createdAt.getTime()).map((c) => ({ id: c.id, name: c.name, email: c.email, invoices: c._count.invoices, proposals: c._count.proposals, retainers: c._count.retainers })),
  }));
}

export async function getClientOverview(workspaceId: string, id: string, now = new Date()) {
  const client = await prisma.client.findFirst({ where: { id, workspaceId }, include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, clientNotes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 100 } } });
  if (!client) return null;
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { invoiceTermsDays: true } });
  const defaultTerms = profile?.invoiceTermsDays ?? 7;
  const [metrics, stats, invoices, proposals, retainers, logs, retainerSummary, owner] = await Promise.all([
    clientMetrics(workspaceId, [id], now),
    settledStats(workspaceId, [id], defaultTerms),
    prisma.invoice.findMany({ where: { workspaceId, clientId: id }, orderBy: { invoiceDate: "desc" }, take: 30, select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, status: true, grandTotal: true, amountReceived: true, currency: true, dateReceived: true, source: true, retainerId: true } }),
    prisma.proposal.findMany({ where: { workspaceId, clientId: id }, orderBy: { dateCreated: "desc" }, take: 15, select: { id: true, proposalNo: true, title: true, status: true, dateCreated: true, validUntil: true } }),
    prisma.retainer.findMany({ where: { workspaceId, clientId: id }, orderBy: { nextBillingDate: "asc" }, take: 15, select: { id: true, name: true, serviceName: true, status: true, frequency: true, nextBillingDate: true, currency: true, amount: true } }),
    prisma.appActivityLog.findMany({ where: { workspaceId, entityType: "client", entityId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, actorEmail: true, createdAt: true, metadata: true } }),
    getClientRetainerSummaries(workspaceId, [id]),
    client.ownerUserId ? prisma.user.findUnique({ where: { id: client.ownerUserId }, select: { name: true, email: true } }) : Promise.resolve(null),
  ]);
  const m = metrics.get(id) ?? ZERO;
  const st = stats.get(id) ?? { avgDaysToPay: null, onTimeRate: null, sample: 0 };
  const terms = client.paymentTermsDays ?? defaultTerms;
  const limit = client.creditLimit === null ? null : Number(client.creditLimit);

  type Ev = { at: string; type: "INVOICE" | "PAYMENT" | "PROPOSAL" | "RETAINER" | "NOTE" | "CHANGE"; title: string; ref?: string; amount?: number; currency?: string };
  const events: Ev[] = [];
  for (const i of invoices) {
    events.push({ at: i.invoiceDate.toISOString(), type: "INVOICE", title: i.invoiceNumber, ref: i.id, amount: Number(i.grandTotal), currency: i.currency });
    if (i.dateReceived && i.status === "PAID") events.push({ at: i.dateReceived.toISOString(), type: "PAYMENT", title: i.invoiceNumber, ref: i.id, amount: Number(i.amountReceived ?? i.grandTotal), currency: i.currency });
  }
  for (const p of proposals) events.push({ at: p.dateCreated.toISOString(), type: "PROPOSAL", title: `${p.proposalNo} ${p.title}`, ref: p.id });
  for (const nn of client.clientNotes) events.push({ at: nn.createdAt.toISOString(), type: "NOTE", title: nn.body.slice(0, 120), ref: nn.id });
  for (const l of logs) events.push({ at: l.createdAt.toISOString(), type: "CHANGE", title: l.action });
  events.sort((a, b) => b.at.localeCompare(a.at));

  const { clientNotes, contacts, ...rest } = client;
  return {
    client: { ...rest, creditLimit: limit, tagList: parseTags(client.tags) },
    owner,
    contacts,
    notes: clientNotes,
    metrics: m,
    payment: { avgDaysToPay: st.avgDaysToPay, onTimeRate: st.onTimeRate, sample: st.sample, termsDays: terms },
    health: clientHealth({ invoiceCount: m.invoiceCount, outstanding: m.outstanding, overdue: m.overdue, onTimeRate: st.onTimeRate, avgDaysToPay: st.avgDaysToPay, termsDays: terms }),
    credit: creditStatus(limit, m.outstanding),
    retainerSummary: retainerSummary.get(id) ?? null,
    invoices: invoices.map((i) => ({ ...i, grandTotal: Number(i.grandTotal), amountReceived: i.amountReceived === null ? null : Number(i.amountReceived) })),
    proposals,
    retainers: retainers.map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) })),
    timeline: events.slice(0, 40),
  };
}

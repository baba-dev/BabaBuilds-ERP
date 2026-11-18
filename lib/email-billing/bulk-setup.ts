import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { FREE_TIER_CLIENT_LIMIT, shouldApplyFreeTierLimits } from '@/lib/entitlements';
import { calculateMailBilling } from './billing-calculator';
import { setupDomainBilling, SetupBillingError } from './setup';
import { nextAnniversary, utcDay } from './usage-math';

export const BULK_APPLY_LIMIT = 200;
const PREVIEW_SAMPLE = 25;

export type BulkSetupInput = {
  workspaceId: string;
  userId?: string | null;
  planId: string;
  /** DISCOVERED uses the day each domain was first seen; DATE uses `startDate` for all of them. */
  startDateSource: 'DISCOVERED' | 'DATE';
  startDate?: Date;
  /** Create a client named after the domain for domains that have none. Without it, unmapped domains are skipped. */
  createClients: boolean;
  /** Off by default: nobody gets an invoice email until you have checked their address. */
  emailInvoices?: boolean;
  /** Limit to these domains; default is every eligible domain. */
  domainIds?: string[];
  now?: Date;
};

type Candidate = { id: string; domain: string; clientId: string | null; clientName: string | null; discoveredAt: Date; mailboxCount: number };

/** Domains that can be set up: served, not yet billed through a retainer, and (unless clients are created) already mapped to a client. */
function eligibleWhere(input: BulkSetupInput): Prisma.MailBillingDomainWhereInput {
  return {
    workspaceId: input.workspaceId, status: 'ACTIVE',
    ...(input.domainIds?.length ? { id: { in: input.domainIds } } : {}),
    ...(input.createClients ? {} : { clientId: { not: null } }),
    subscriptions: { none: { retainerId: { not: null } } },
  };
}

async function eligibleDomains(input: BulkSetupInput, take: number): Promise<Candidate[]> {
  const rows = await prisma.mailBillingDomain.findMany({
    where: eligibleWhere(input),
    select: { id: true, domain: true, clientId: true, discoveredAt: true, mailboxCount: true, client: { select: { name: true } } },
    orderBy: { domain: 'asc' },
    take,
  });
  return rows.map((r) => ({ id: r.id, domain: r.domain, clientId: r.clientId, clientName: r.client?.name ?? null, discoveredAt: r.discoveredAt, mailboxCount: r.mailboxCount }));
}

const startFor = (input: BulkSetupInput, domain: Candidate) => utcDay(input.startDateSource === 'DATE' && input.startDate ? input.startDate : domain.discoveredAt);

/** What an apply would do, without changing anything. */
export async function previewBulkSetup(input: BulkSetupInput) {
  const now = input.now ?? new Date();
  const plan = await prisma.mailBillingPlan.findFirst({ where: { id: input.planId, workspaceId: input.workspaceId, isActive: true } });
  if (!plan) throw new SetupBillingError('Plan not found or inactive.', 404);
  const total = await prisma.mailBillingDomain.count({ where: eligibleWhere(input) });
  const sample = await eligibleDomains(input, PREVIEW_SAMPLE);
  const unmappedSkipped = input.createClients ? 0 : await prisma.mailBillingDomain.count({
    where: { workspaceId: input.workspaceId, status: 'ACTIVE', clientId: null, ...(input.domainIds?.length ? { id: { in: input.domainIds } } : {}), subscriptions: { none: { retainerId: { not: null } } } },
  });
  const rows = sample.map((d) => {
    const calc = calculateMailBilling({ plan, subscription: null, syncedMailboxCount: d.mailboxCount, domain: d.domain });
    return {
      domainId: d.id, domain: d.domain, client: d.clientName ?? (input.createClients ? `${d.domain} (new client)` : null),
      startDate: startFor(input, d).toISOString().slice(0, 10),
      firstBillingDate: calc.reviewRequired ? null : nextAnniversary(startFor(input, d), plan.frequency, now).toISOString().slice(0, 10),
      amount: calc.totalRecurringAmount, currency: calc.currency,
    };
  });
  return { eligible: total, unmappedSkipped, willProcessNow: Math.min(total, BULK_APPLY_LIMIT), sample: rows, emailInvoices: input.emailInvoices === true };
}

/** The customer record named after a domain: reuses one that exists, otherwise creates a bare one to be completed later. */
export async function ensureClientForDomain(workspaceId: string, domain: { domain: string }, ws: { countryCode: string | null }): Promise<string> {
  const existing = await prisma.client.findFirst({ where: { workspaceId, name: domain.domain }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.client.create({
    data: { workspaceId, name: domain.domain, address: '', country: ws.countryCode ?? '', countryCode: ws.countryCode ?? null, source: 'IMPORT', isExport: false },
    select: { id: true },
  });
  return created.id;
}

export type BulkResult = { domain: string; ok: boolean; error?: string; firstBillingDate?: string | null };

/** Sets up billing for up to BULK_APPLY_LIMIT domains. Run it again for the rest; finished domains are no longer eligible. */
export async function runBulkSetup(input: BulkSetupInput) {
  const now = input.now ?? new Date();
  const { workspaceId } = input;
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true, planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, _count: { select: { clients: { where: { isWalkIn: false, archivedAt: null } } } } } });
  if (!ws) throw new SetupBillingError('Workspace not found.', 404);
  const batch = await eligibleDomains(input, BULK_APPLY_LIMIT);

  const needNewClients = input.createClients ? batch.filter((d) => !d.clientId).length : 0;
  if (needNewClients > 0 && shouldApplyFreeTierLimits(ws) && ws._count.clients + needNewClients > FREE_TIER_CLIENT_LIMIT) {
    throw new SetupBillingError(`This would create ${needNewClients} clients and go over the ${FREE_TIER_CLIENT_LIMIT}-client limit of the Free plan.`, 403);
  }

  const results: BulkResult[] = [];
  for (const domain of batch) {
    try {
      const clientId = domain.clientId ?? (await ensureClientForDomain(workspaceId, domain, ws));
      const done = await setupDomainBilling({
        workspaceId, userId: input.userId, domainId: domain.id, planId: input.planId, clientId, startDate: startFor(input, domain),
        emailInvoices: input.emailInvoices === true, now,
      });
      results.push({ domain: domain.domain, ok: true, firstBillingDate: done.firstBillingDate?.toISOString().slice(0, 10) ?? null });
    } catch (error) {
      results.push({ domain: domain.domain, ok: false, error: error instanceof SetupBillingError ? error.message : 'Could not set up this domain.' });
      if (!(error instanceof SetupBillingError)) console.error('Bulk billing setup failed for a domain:', domain.id, error);
    }
  }
  const summary = { processed: results.length, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, remaining: await prisma.mailBillingDomain.count({ where: eligibleWhere(input) }) };
  void logActivity({
    workspaceId, action: 'email_billing.bulk_billing_setup', status: summary.failed ? 'FAILURE' : 'SUCCESS', actor: { userId: input.userId ?? 'system', email: input.userId ? null : 'system' },
    entity: { type: 'mail_billing_plan', id: input.planId }, metadata: { ...summary, createClients: input.createClients, emailInvoices: input.emailInvoices === true, startDateSource: input.startDateSource },
  });
  return { ...summary, results };
}

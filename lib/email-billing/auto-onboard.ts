import 'server-only';
import { prisma } from '@/lib/prisma';
import { FREE_TIER_CLIENT_LIMIT, shouldApplyFreeTierLimits } from '@/lib/entitlements';
import { ensureClientForDomain } from './bulk-setup';
import { createMailBillingReviewItem, resolveMailBillingReviewItems } from './review';
import { SetupBillingError, setupDomainBilling } from './setup';
import { loadMailBillingSettings } from './settings';

/**
 * More than this many new domains in one run is treated as a re-import or a mistake, not as new customers: nothing is billed
 * automatically and the owner is asked to review them with the previewed bulk setup instead.
 */
export const AUTO_ONBOARD_MAX_PER_RUN = 25;

export type AutoOnboardResult = { status: 'OFF' | 'NEEDS_PLAN' | 'TOO_MANY' | 'DONE'; onboarded: number; failed: number; candidates: number };

/**
 * Brings newly discovered domains into the ERP's processes: a customer record, a subscription on the default plan and a
 * recurring retainer, so the invoice job, payments calendar, digest, quota alerts and usage billing all pick them up.
 *
 * Only for domains that were first seen after auto-onboarding was switched on AND after the server's first successful
 * sync (so connecting a server never bills the existing customer base), that nobody has started billing manually, and that
 * are still being served. Safe to run repeatedly: a domain that has a subscription is no longer a candidate.
 */
export async function autoOnboardNewDomains(workspaceId: string, now = new Date()): Promise<AutoOnboardResult> {
  const settings = await loadMailBillingSettings(workspaceId);
  if (!settings.autoOnboardNewDomains || !settings.autoOnboardSince) return { status: 'OFF', onboarded: 0, failed: 0, candidates: 0 };

  if (!settings.defaultPlanId) {
    await createMailBillingReviewItem({
      workspaceId, type: 'AUTO_ONBOARD_NEEDS_PLAN', severity: 'WARNING', title: 'Automatic onboarding needs a default plan',
      description: 'New domains cannot be set up automatically until a default plan is chosen.', suggestedAction: 'Choose a default plan in the Email Hosting settings.',
    });
    return { status: 'NEEDS_PLAN', onboarded: 0, failed: 0, candidates: 0 };
  }
  await resolveMailBillingReviewItems(workspaceId, { types: ['AUTO_ONBOARD_NEEDS_PLAN'] });

  const fresh = await prisma.mailBillingDomain.findMany({
    where: { workspaceId, status: 'ACTIVE', discoveredAt: { gte: settings.autoOnboardSince }, subscriptions: { none: {} } },
    select: { id: true, domain: true, clientId: true, discoveredAt: true, serverId: true },
    orderBy: { discoveredAt: 'asc' },
    take: AUTO_ONBOARD_MAX_PER_RUN + 1,
  });
  if (fresh.length === 0) return { status: 'DONE', onboarded: 0, failed: 0, candidates: 0 };

  // A domain only counts as "new" if its server had already finished a sync before it appeared.
  const baselines = new Map<string, Date | null>();
  for (const serverId of new Set(fresh.map((d) => d.serverId))) {
    const first = await prisma.mailBillingSyncRun.findFirst({ where: { workspaceId, serverId, status: 'SUCCESS' }, orderBy: { startedAt: 'asc' }, select: { finishedAt: true } });
    baselines.set(serverId, first?.finishedAt ?? null);
  }
  const candidates = fresh.filter((d) => { const base = baselines.get(d.serverId); return base !== null && base !== undefined && d.discoveredAt.getTime() > base.getTime(); });
  if (candidates.length === 0) return { status: 'DONE', onboarded: 0, failed: 0, candidates: 0 };

  if (candidates.length > AUTO_ONBOARD_MAX_PER_RUN) {
    await createMailBillingReviewItem({
      workspaceId, type: 'AUTO_ONBOARD_TOO_MANY', severity: 'WARNING', title: `More than ${AUTO_ONBOARD_MAX_PER_RUN} new domains appeared at once`,
      description: 'This looks like a re-import rather than new customers, so nothing was set up automatically.', suggestedAction: 'Review them with "Set up billing for many" (preview first).',
    });
    return { status: 'TOO_MANY', onboarded: 0, failed: 0, candidates: candidates.length };
  }

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true, planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, _count: { select: { clients: { where: { isWalkIn: false, archivedAt: null } } } } } });
  if (!ws) return { status: 'DONE', onboarded: 0, failed: 0, candidates: candidates.length };
  let clientCount = ws._count.clients;

  let onboarded = 0;
  let failed = 0;
  for (const domain of candidates) {
    try {
      let clientId = domain.clientId;
      if (!clientId) {
        if (shouldApplyFreeTierLimits(ws) && clientCount >= FREE_TIER_CLIENT_LIMIT) throw new SetupBillingError(`The Free plan allows ${FREE_TIER_CLIENT_LIMIT} clients.`, 403);
        clientId = await ensureClientForDomain(workspaceId, domain, ws);
        clientCount += 1;
      }
      const result = await setupDomainBilling({
        workspaceId, userId: null, domainId: domain.id, planId: settings.defaultPlanId, clientId, startDate: domain.discoveredAt,
        trialDays: settings.autoOnboardTrialDays, emailInvoices: settings.autoOnboardEmailInvoices, now,
      });
      onboarded += 1;
      await createMailBillingReviewItem({
        workspaceId, domainId: domain.id, serverId: domain.serverId, subscriptionId: result.subscriptionId, type: 'DOMAIN_AUTO_ONBOARDED', severity: 'INFO',
        title: `${domain.domain} was set up automatically`,
        description: `Customer "${domain.domain}" and a ${settings.autoOnboardTrialDays > 0 ? 'trial then ' : ''}recurring subscription on your default plan were created. First invoice: ${result.firstBillingDate?.toISOString().slice(0, 10) ?? 'not scheduled'}.`,
        suggestedAction: 'Rename the customer and add their email address so invoices reach them.',
      });
    } catch (error) {
      failed += 1;
      await createMailBillingReviewItem({
        workspaceId, domainId: domain.id, serverId: domain.serverId, type: 'AUTO_ONBOARD_FAILED', severity: 'WARNING', title: `${domain.domain} could not be set up automatically`,
        description: error instanceof SetupBillingError ? error.message : 'An unexpected error stopped automatic setup.', suggestedAction: 'Set up billing for this domain by hand from its page.',
      }).catch(() => null);
      if (!(error instanceof SetupBillingError)) console.error('Automatic onboarding failed for a domain:', domain.id, error);
    }
  }
  return { status: 'DONE', onboarded, failed, candidates: candidates.length };
}

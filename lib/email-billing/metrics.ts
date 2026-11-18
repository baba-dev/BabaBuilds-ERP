import 'server-only';
import { prisma } from '@/lib/prisma';
import { retainerMrr } from '@/lib/retainers/mrr';
import { monthlyEquivalent } from '@/lib/retainers/schedule';
import { calculateMailBilling } from './billing-calculator';
import { monthlyRate } from './accrual';
import { loadMailBillingSettings } from './settings';

const DAY_MS = 86_400_000;
export const METRICS_WINDOW_DAYS = 30;

/** Percentage of subscriptions at the start of the window that cancelled during it. Null when there were none to lose. */
export function churnRatePercent(startActive: number, cancelledInWindow: number): number | null {
  if (startActive <= 0) return null;
  return Math.round((cancelledInWindow / startActive) * 1000) / 10;
}

type SubForMetrics = {
  billingStatus: string; startedAt: Date; cancelledAt: Date | null;
};

/** Subscriptions that existed at `at` and had not yet cancelled. */
export function activeAt(subs: SubForMetrics[], at: Date): number {
  return subs.filter((s) => s.startedAt <= at && (!s.cancelledAt || s.cancelledAt > at)).length;
}

/**
 * Email Hosting revenue and growth figures.
 *  - mrr: what the billing engine will actually invoice each month (ACTIVE retainers of live subscriptions), in the
 *    workspace base currency, using the same formula as the Retainers page.
 *  - pipelineMrr: expected monthly revenue of trials and not-yet-billed subscriptions, in the base currency only.
 */
export async function computeEmailHostingMetrics(workspaceId: string, now = new Date()) {
  const windowStart = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);
  const [workspace, settings, subs] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    loadMailBillingSettings(workspaceId),
    prisma.mailBillingSubscription.findMany({
      where: { workspaceId },
      include: {
        plan: { select: { frequency: true } }, domain: { select: { domain: true, mailboxCount: true } },
        retainer: { select: { status: true, frequency: true, exchangeRate: true, items: { select: { quantity: true, unitPrice: true, taxRate: true } } } },
      },
    }),
  ]);
  const baseCurrency = workspace?.baseCurrency || 'INR';

  let mrr = 0;
  let pipelineMrr = 0;
  const counts = { active: 0, trialing: 0, reviewRequired: 0, paused: 0, cancelled: 0 };
  for (const s of subs) {
    if (s.billingStatus === 'CANCELLED') { counts.cancelled++; continue; }
    if (s.billingStatus === 'PAUSED') { counts.paused++; continue; }
    if (settings.billingModel === 'ACCRUAL') {
      // No retainers: the monthly run-rate is what the live addresses earn each month at their plan's price.
      counts.active++;
      if (s.billingStatus === 'ACTIVE' && s.currencySnapshot === baseCurrency) mrr += s.domain.mailboxCount * monthlyRate(s.basePriceSnapshot, s.plan?.frequency ?? 'MONTHLY');
      continue;
    }
    if (s.billingStatus === 'TRIALING') counts.trialing++;
    else if (s.billingStatus === 'REVIEW_REQUIRED') counts.reviewRequired++;
    else counts.active++;

    if (s.retainer?.status === 'ACTIVE' && s.billingStatus !== 'TRIALING') {
      mrr += retainerMrr({ status: s.retainer.status, frequency: s.retainer.frequency, exchangeRate: s.retainer.exchangeRate, items: s.retainer.items });
    } else if (s.currencySnapshot === baseCurrency) {
      const calc = calculateMailBilling({ plan: s.plan as never, subscription: s, syncedMailboxCount: s.domain.mailboxCount, domain: s.domain.domain });
      pipelineMrr += monthlyEquivalent(calc.totalRecurringAmount, s.plan?.frequency ?? 'MONTHLY');
    }
  }

  const startActive = activeAt(subs, windowStart);
  const cancelledInWindow = subs.filter((s) => s.cancelledAt && s.cancelledAt > windowStart && s.startedAt <= windowStart).length;
  const newInWindow = subs.filter((s) => s.startedAt > windowStart).length;

  const latestDay = await prisma.mailUsageSnapshot.findFirst({ where: { workspaceId }, orderBy: { capturedOn: 'desc' }, select: { capturedOn: true } });
  const earlierDay = await prisma.mailUsageSnapshot.findFirst({ where: { workspaceId, capturedOn: { lte: windowStart } }, orderBy: { capturedOn: 'desc' }, select: { capturedOn: true } });
  const sumOn = async (day: Date | undefined) => day
    ? (await prisma.mailUsageSnapshot.aggregate({ where: { workspaceId, capturedOn: day }, _sum: { mailboxCount: true } }))._sum.mailboxCount ?? 0
    : null;
  const current = await sumOn(latestDay?.capturedOn);
  const previous = await sumOn(earlierDay?.capturedOn);

  return {
    billingModel: settings.billingModel,
    baseCurrency,
    mrr: Math.round(mrr * 100) / 100,
    pipelineMrr: Math.round(pipelineMrr * 100) / 100,
    subscriptions: counts,
    mailboxes: { current, windowAgo: previous, change: current !== null && previous !== null ? current - previous : null },
    churn: { windowDays: METRICS_WINDOW_DAYS, startActive, cancelled: cancelledInWindow, ratePercent: churnRatePercent(startActive, cancelledInWindow) },
    newSubscriptions: newInWindow,
    lastSnapshotOn: latestDay?.capturedOn.toISOString().slice(0, 10) ?? null,
  };
}

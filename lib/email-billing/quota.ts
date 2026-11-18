import 'server-only';
import { prisma } from '@/lib/prisma';
import { createMailBillingReviewItem, resolveMailBillingReviewItems } from './review';

/** Percent of quota used, or null when the mailbox has no limit or no usage was reported. */
export function quotaPercent(usedMb: number | null | undefined, quotaMb: number | null | undefined): number | null {
  if (usedMb === null || usedMb === undefined || !quotaMb || quotaMb <= 0) return null;
  return Math.round((usedMb / quotaMb) * 1000) / 10;
}

type Candidate = { email: string; domainId: string; usedMb: number; quotaMb: number };

/** Mailboxes at or above the alert level, worst first. Pure so the rule is tested without a database. */
export function overQuota<T extends { usedMb: number | null; quotaMb: number | null }>(rows: T[], alertPercent: number): Array<T & { percent: number }> {
  if (alertPercent <= 0) return [];
  return rows
    .map((r) => ({ ...r, percent: quotaPercent(r.usedMb, r.quotaMb) }))
    .filter((r): r is T & { percent: number } => r.percent !== null && r.percent >= alertPercent)
    .sort((a, b) => b.percent - a.percent);
}

const MAX_LISTED = 10;

/**
 * One review item per domain that has mailboxes near their quota, listing the worst ones; cleared again when no mailbox of
 * that domain is above the level any more. Returns how many domains are currently flagged.
 */
export async function syncQuotaAlerts(workspaceId: string, alertPercent: number): Promise<number> {
  const rows = await prisma.mailBillingMailbox.findMany({
    where: { workspaceId, status: 'ACTIVE', usedMb: { not: null }, quotaMb: { gt: 0 }, domain: { status: 'ACTIVE' } },
    select: { email: true, domainId: true, usedMb: true, quotaMb: true, domain: { select: { domain: true, serverId: true } } },
  });
  const flagged = overQuota(rows, alertPercent);
  const byDomain = new Map<string, typeof flagged>();
  for (const row of flagged) byDomain.set(row.domainId, [...(byDomain.get(row.domainId) ?? []), row]);

  for (const [domainId, list] of byDomain) {
    const { domain, serverId } = list[0].domain;
    await createMailBillingReviewItem({
      workspaceId, domainId, serverId, type: 'MAILBOX_QUOTA_HIGH', severity: list.some((r) => r.percent >= 100) ? 'CRITICAL' : 'WARNING',
      title: `${list.length} mailbox${list.length === 1 ? '' : 'es'} on ${domain} ${list.length === 1 ? 'is' : 'are'} almost full`,
      description: list.slice(0, MAX_LISTED).map((r) => `${r.email}: ${r.percent}% of ${r.quotaMb} MB`).join('; '),
      suggestedAction: 'Raise the quota, or ask the customer to clear space.',
      metadataJson: { threshold: alertPercent, mailboxes: list.slice(0, MAX_LISTED).map((r) => ({ email: r.email, percent: r.percent })) },
    });
  }

  // Resolve alerts for domains that are no longer over the level (or when the alert is switched off).
  const open = await prisma.mailBillingReviewItem.findMany({ where: { workspaceId, status: 'OPEN', type: 'MAILBOX_QUOTA_HIGH', domainId: { not: null } }, select: { domainId: true } });
  for (const { domainId } of open) {
    if (domainId && !byDomain.has(domainId)) await resolveMailBillingReviewItems(workspaceId, { domainId, types: ['MAILBOX_QUOTA_HIGH'] });
  }
  return byDomain.size;
}

export type { Candidate as QuotaCandidate };

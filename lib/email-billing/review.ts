import 'server-only';
import { prisma } from '@/lib/prisma';

export type MailBillingReviewType =
  | 'NEW_DOMAIN_DISCOVERED' | 'DOMAIN_MISSING_CLIENT' | 'DOMAIN_MISSING_SUBSCRIPTION' | 'DOMAIN_MISSING_RETAINER'
  | 'MAILBOX_COUNT_CHANGED' | 'MAILBOX_ADDED' | 'MAILBOX_REMOVED' | 'DOMAIN_REMOVED_FROM_MIAB'
  | 'BILLING_ACTIVE_BUT_DOMAIN_REMOVED' | 'RETAINER_PAUSED_BUT_DOMAIN_ACTIVE' | 'SYNC_FAILED' | 'SERVER_CONNECTION_FAILED';

export async function createMailBillingReviewItem(input: {
  workspaceId: string; domainId?: string | null; subscriptionId?: string | null; serverId?: string | null;
  type: MailBillingReviewType; severity?: 'INFO' | 'WARNING' | 'CRITICAL'; title: string; description: string; suggestedAction?: string;
  oldValueJson?: unknown; newValueJson?: unknown; metadataJson?: unknown;
}) {
  const existing = await prisma.mailBillingReviewItem.findFirst({
    where: { workspaceId: input.workspaceId, domainId: input.domainId ?? null, subscriptionId: input.subscriptionId ?? null, serverId: input.serverId ?? null, type: input.type, status: 'OPEN' },
    select: { id: true },
  });
  if (existing) return { item: existing, created: false };
  const item = await prisma.mailBillingReviewItem.create({ data: {
    workspaceId: input.workspaceId, domainId: input.domainId ?? null, subscriptionId: input.subscriptionId ?? null, serverId: input.serverId ?? null,
    type: input.type, severity: input.severity ?? 'INFO', title: input.title, description: input.description, suggestedAction: input.suggestedAction,
    oldValueJson: input.oldValueJson as any, newValueJson: input.newValueJson as any, metadataJson: input.metadataJson as any,
  }});
  return { item, created: true };
}

export async function resolveMailBillingReviewItems(workspaceId: string, filters: { domainId?: string; subscriptionId?: string; types?: MailBillingReviewType[] }, userId?: string) {
  return prisma.mailBillingReviewItem.updateMany({
    where: { workspaceId, status: 'OPEN', ...(filters.domainId ? { domainId: filters.domainId } : {}), ...(filters.subscriptionId ? { subscriptionId: filters.subscriptionId } : {}), ...(filters.types ? { type: { in: filters.types } } : {}) },
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: userId ?? null },
  });
}

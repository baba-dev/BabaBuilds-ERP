import type { Prisma } from "@prisma/client";
import 'server-only';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { fetchMailBillingInventory } from './miab-client';
import { logActivity } from '@/lib/security/activity-log';
import { createMailBillingReviewItem, type MailBillingDb } from './review';
import type { MailBillingAccessMode, MailBillingInventory } from "./miab-client";

type InventoryDomain = MailBillingInventory['domains'][number];

/** A domain with all of its mailboxes is written in one transaction; large inventories never hold one giant lock. */
const DOMAIN_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

async function review(input: Parameters<typeof createMailBillingReviewItem>[0], db: MailBillingDb) {
  const result = await createMailBillingReviewItem(input, db);
  return result.created ? 1 : 0;
}

type ExistingDomain = { id: string; domain: string; mailboxCount: number; status: string };

/** Upserts one domain, its mailboxes and the review items they imply, atomically. Returns what changed. */
async function syncDomain(args: {
  workspaceId: string; serverId: string; now: Date; d: InventoryDomain;
  previous: ExistingDomain | undefined; knownMailboxEmails: Set<string>;
}) {
  const { workspaceId, serverId, now, d, previous, knownMailboxEmails } = args;
  return prisma.$transaction(async (tx) => {
    let reviewItemsCreated = 0;
    let mailboxesAdded = 0;
    const domain = await tx.mailBillingDomain.upsert({
      where: { workspaceId_serverId_domain: { workspaceId, serverId, domain: d.domain } },
      create: { workspaceId, serverId, domain: d.domain, aliasCount: d.aliasesCount || 0, mailboxCount: d.mailboxes.length, status: 'ACTIVE', lastSeenAt: now },
      update: { aliasCount: d.aliasesCount || 0, mailboxCount: d.mailboxes.length, status: 'ACTIVE', lastSeenAt: now, archivedAt: null },
    });
    if (!previous) {
      reviewItemsCreated += await review({ workspaceId, domainId: domain.id, serverId, type: 'NEW_DOMAIN_DISCOVERED', severity: 'INFO', title: `New email domain discovered: ${d.domain}`, description: `${d.domain} was discovered during Mail-in-a-Box inventory sync.`, suggestedAction: 'Map the domain to a client and create an Email Billing subscription.' }, tx);
    }
    if (!domain.clientId) reviewItemsCreated += await review({ workspaceId, domainId: domain.id, serverId, type: 'DOMAIN_MISSING_CLIENT', severity: 'WARNING', title: `${d.domain} is not mapped to a client`, description: 'Hosted email domains need an ERP client mapping before billing can be created.', suggestedAction: 'Map this domain to a client.' }, tx);
    const subscription = await tx.mailBillingSubscription.findUnique({ where: { workspaceId_domainId: { workspaceId, domainId: domain.id } } });
    if (!subscription) {
      reviewItemsCreated += await review({ workspaceId, domainId: domain.id, serverId, type: 'DOMAIN_MISSING_SUBSCRIPTION', severity: 'WARNING', title: `${d.domain} has no Email Billing subscription`, description: 'Inventory exists but no commercial subscription is active for this domain.', suggestedAction: 'Create a subscription and link or create a retainer.' }, tx);
    } else {
      if (!subscription.retainerId) reviewItemsCreated += await review({ workspaceId, domainId: domain.id, subscriptionId: subscription.id, serverId, type: 'DOMAIN_MISSING_RETAINER', severity: 'WARNING', title: `${d.domain} subscription has no retainer`, description: 'The subscription cannot be billed by the recurring engine until a retainer is linked.', suggestedAction: 'Create or link a retainer.' }, tx);
      if (previous && previous.mailboxCount !== d.mailboxes.length) {
        reviewItemsCreated += await review({ workspaceId, domainId: domain.id, subscriptionId: subscription.id, serverId, type: 'MAILBOX_COUNT_CHANGED', severity: 'WARNING', title: `Mailbox count changed for ${d.domain}`, description: `Mailbox count changed from ${previous.mailboxCount} to ${d.mailboxes.length}.`, suggestedAction: subscription.autoUpdateQuantity ? 'Retainer quantity may be updated by explicit recalculation.' : 'Review billing quantity before changing retainer items.', oldValueJson: { mailboxCount: previous.mailboxCount }, newValueJson: { mailboxCount: d.mailboxes.length } }, tx);
        await tx.mailBillingSubscription.update({ where: { id: subscription.id }, data: { lastSyncedMailboxCount: d.mailboxes.length, pendingMailboxCount: d.mailboxes.length, billingStatus: subscription.autoUpdateQuantity ? subscription.billingStatus : 'REVIEW_REQUIRED' } });
      }
    }
    for (const m of d.mailboxes) {
      if (!knownMailboxEmails.has(m.email)) {
        mailboxesAdded++;
        reviewItemsCreated += await review({ workspaceId, domainId: domain.id, serverId, type: 'MAILBOX_ADDED', severity: 'INFO', title: `Mailbox added: ${m.email}`, description: `${m.email} was discovered during inventory sync.`, suggestedAction: 'Review whether billing quantity should change.', newValueJson: { email: m.email } }, tx);
      }
      const fields = { localPart: m.email.split('@')[0], quotaMb: m.quotaMb ?? null, isAdmin: Boolean(m.isAdmin), status: m.status || 'ACTIVE', lastSeenAt: now, rawJson: m.raw as Prisma.InputJsonValue };
      await tx.mailBillingMailbox.upsert({
        where: { workspaceId_serverId_email: { workspaceId, serverId, email: m.email } },
        create: { workspaceId, serverId, domainId: domain.id, email: m.email, ...fields },
        update: { domainId: domain.id, ...fields, archivedAt: null },
      });
    }
    return { reviewItemsCreated, mailboxesAdded };
  }, DOMAIN_TX_OPTIONS);
}

export async function syncMailBillingServer({ workspaceId, serverId, actorUserId, request }: { workspaceId: string; serverId: string; actorUserId?: string; request?: Request }) {
  const server = await prisma.mailBillingServer.findFirst({ where: { id: serverId, workspaceId } });
  if (!server) throw new Error('Mail billing server not found');
  const run = await prisma.mailBillingSyncRun.create({ data: { workspaceId, serverId, status: 'RUNNING' } });
  let reviewItemsCreated = 0;
  try {
    const token = server.encryptedToken ? decrypt(server.encryptedToken) : undefined;
    const inventory = await fetchMailBillingInventory({ baseUrl: server.baseUrl, accessMode: server.accessMode as MailBillingAccessMode, token });
    const now = new Date();
    const existingDomains = await prisma.mailBillingDomain.findMany({ where: { workspaceId, serverId }, include: { subscriptions: true } });
    const existingMailboxes = await prisma.mailBillingMailbox.findMany({ where: { workspaceId, serverId }, select: { id: true, email: true, domainId: true, status: true } });
    const domainByName = new Map(existingDomains.map((d) => [d.domain, d]));
    const knownMailboxEmails = new Set(existingMailboxes.map((m) => m.email));
    const seenDomains = new Set<string>(), seenMailboxes = new Set<string>();
    let domainsAdded = 0, mailboxesAdded = 0;

    for (const d of inventory.domains) {
      const previous = domainByName.get(d.domain);
      seenDomains.add(d.domain);
      for (const m of d.mailboxes) seenMailboxes.add(m.email);
      if (!previous) domainsAdded++;
      const result = await syncDomain({ workspaceId, serverId, now, d, previous, knownMailboxEmails });
      reviewItemsCreated += result.reviewItemsCreated;
      mailboxesAdded += result.mailboxesAdded;
    }

    // Already-REMOVED rows stay removed: they must not be re-counted, re-flagged or re-archived on every sync.
    const removedDomains = existingDomains.filter((d) => !seenDomains.has(d.domain) && d.status !== 'REMOVED');
    const removedMailboxes = existingMailboxes.filter((m) => !seenMailboxes.has(m.email) && m.status !== 'REMOVED');
    reviewItemsCreated += await prisma.$transaction(async (tx) => {
      let created = 0;
      for (const d of removedDomains) {
        created += await review({ workspaceId, domainId: d.id, serverId, type: 'DOMAIN_REMOVED_FROM_MIAB', severity: 'CRITICAL', title: `${d.domain} is missing from Mail-in-a-Box sync`, description: 'The domain was previously synced but was not present in the latest inventory.', suggestedAction: 'Confirm whether hosting ended or the sync source is incomplete.' }, tx);
        const sub = d.subscriptions[0];
        if (sub?.billingStatus === 'ACTIVE') created += await review({ workspaceId, domainId: d.id, subscriptionId: sub.id, serverId, type: 'BILLING_ACTIVE_BUT_DOMAIN_REMOVED', severity: 'CRITICAL', title: `${d.domain} is still billed but no longer appears hosted`, description: 'Billing subscription is active while the domain is removed from inventory.', suggestedAction: 'Pause/cancel the subscription or restore the domain in Mail-in-a-Box.' }, tx);
      }
      for (const m of removedMailboxes) created += await review({ workspaceId, domainId: m.domainId, serverId, type: 'MAILBOX_REMOVED', severity: 'INFO', title: `Mailbox removed: ${m.email}`, description: `${m.email} was not present in the latest inventory.`, suggestedAction: 'Review whether billing quantity should change.', oldValueJson: { email: m.email } }, tx);
      await tx.mailBillingDomain.updateMany({ where: { id: { in: removedDomains.map((d) => d.id) }, workspaceId }, data: { status: 'REMOVED', archivedAt: now } });
      await tx.mailBillingMailbox.updateMany({ where: { id: { in: removedMailboxes.map((m) => m.id) }, workspaceId }, data: { status: 'REMOVED', archivedAt: now } });
      return created;
    }, DOMAIN_TX_OPTIONS);

    const summary = { domainsSeen: seenDomains.size, mailboxesSeen: seenMailboxes.size, domainsAdded, domainsRemoved: removedDomains.length, mailboxesAdded, mailboxesRemoved: removedMailboxes.length, reviewItemsCreated };
    await prisma.mailBillingSyncRun.update({ where: { id: run.id }, data: { status: 'SUCCESS', finishedAt: now, ...summary, summaryJson: summary as Prisma.InputJsonValue } });
    await prisma.mailBillingServer.update({ where: { id: serverId }, data: { lastSyncAt: now, lastSyncStatus: 'SUCCESS', lastSyncError: null, status: 'ACTIVE' } });
    await logActivity({ workspaceId, actor: { userId: actorUserId }, action: 'mail_billing.sync', status: 'SUCCESS', entity: { type: 'MailBillingServer', id: serverId }, metadata: summary, request });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    reviewItemsCreated += await review({ workspaceId, serverId, type: 'SYNC_FAILED', severity: 'CRITICAL', title: `Email Billing sync failed for ${server.name}`, description: message, suggestedAction: 'Check server settings, token, URL validation, and source availability.' }, prisma).catch(() => 0);
    await prisma.mailBillingSyncRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message, reviewItemsCreated } });
    await prisma.mailBillingServer.update({ where: { id: serverId }, data: { lastSyncAt: new Date(), lastSyncStatus: 'FAILED', lastSyncError: message, status: 'ERROR' } });
    throw error;
  }
}

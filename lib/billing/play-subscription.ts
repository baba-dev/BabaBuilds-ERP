import "server-only";

import { prisma } from "@/lib/prisma";
import { downgradeWorkspaceToFree } from "@/lib/billing/downgrade";
import { acknowledgeSubscription, getSubscriptionPurchaseV2 } from "@/lib/billing/google-play-client";
import {
  isEntitledState,
  normalizePlayPurchase,
  type NormalizedPlayPurchase,
} from "@/lib/billing/play-products";
import { getListPriceForInterval, tierFromInterval } from "@/lib/subscription-checkout";
import { logActivity } from "@/lib/security/activity-log";

export class PlayBindingError extends Error {
  constructor(
    message: string,
    public readonly code: "TOKEN_BOUND_TO_OTHER_WORKSPACE" | "WORKSPACE_NOT_FOUND",
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PlayBindingError";
  }
}

export type PlaySyncResult =
  | { ok: true; ignored: true; reason: "UNKNOWN_TOKEN" }
  | {
      ok: true;
      ignored: false;
      workspaceId: string;
      entitled: boolean;
      interval: NormalizedPlayPurchase["interval"];
      state: string;
      expiresAt: Date | null;
    };

export type PlaySyncSource = "client_verify" | "rtdn" | "voided";

function allowTestPurchases(): boolean {
  return process.env.GOOGLE_PLAY_ALLOW_TEST_PURCHASES === "true" || process.env.NODE_ENV !== "production";
}

/**
 * Re-reads a purchase from Google (the only source of truth), binds it to a workspace, and applies the
 * resulting entitlement. Safe to call repeatedly (verify retries, duplicate or out-of-order RTDN).
 *
 * - `workspaceId` is passed only by the authenticated verify endpoint. A token can be bound to exactly
 *   one workspace, ever; presenting someone else's token is rejected, so tokens cannot be shared.
 * - RTDN calls omit `workspaceId` and are resolved through the stored binding; unknown tokens are ignored
 *   (the app will call verify, which creates the binding).
 */
export async function syncPlayPurchase(input: {
  purchaseToken: string;
  workspaceId?: string;
  source: PlaySyncSource;
  actor?: { userId?: string; email?: string | null };
}): Promise<PlaySyncResult> {
  const { purchaseToken } = input;

  const existing = await prisma.playPurchase.findUnique({ where: { purchaseToken } });
  if (existing && input.workspaceId && existing.workspaceId !== input.workspaceId) {
    throw new PlayBindingError("This Google Play purchase belongs to a different workspace.", "TOKEN_BOUND_TO_OTHER_WORKSPACE", 409);
  }
  const workspaceId = existing?.workspaceId ?? input.workspaceId;
  if (!workspaceId) return { ok: true, ignored: true, reason: "UNKNOWN_TOKEN" };

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, subscriptionStatus: true, subscriptionEndsAt: true, billingProvider: true, billingProviderSubscriptionId: true },
  });
  if (!workspace) throw new PlayBindingError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);

  const raw = await getSubscriptionPurchaseV2(purchaseToken);
  const purchase = normalizePlayPurchase(raw, { allowTestPurchases: allowTestPurchases() });
  const now = new Date();
  const entitled = isEntitledState(purchase.state, purchase.expiresAt, now);

  // A resubscribe / plan change links to the previous token: that one is superseded, and must be ours.
  if (purchase.linkedPurchaseToken) {
    const previous = await prisma.playPurchase.findUnique({ where: { purchaseToken: purchase.linkedPurchaseToken } });
    if (previous && previous.workspaceId !== workspaceId) {
      throw new PlayBindingError("This Google Play purchase belongs to a different workspace.", "TOKEN_BOUND_TO_OTHER_WORKSPACE", 409);
    }
  }

  const tier = tierFromInterval(purchase.interval);
  const otherProviderActive =
    workspace.billingProvider !== "GOOGLE_PLAY" &&
    ["PRO", "TEAM"].includes(workspace.subscriptionStatus) &&
    workspace.subscriptionEndsAt &&
    workspace.subscriptionEndsAt > now
      ? workspace.subscriptionEndsAt
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.playPurchase.upsert({
      where: { purchaseToken },
      create: {
        workspaceId,
        purchaseToken,
        productId: purchase.productId,
        interval: purchase.interval,
        subscriptionState: purchase.state,
        autoRenewing: purchase.autoRenewing,
        expiresAt: purchase.expiresAt,
        latestOrderId: purchase.latestOrderId,
        linkedPurchaseToken: purchase.linkedPurchaseToken,
        isTestPurchase: purchase.isTestPurchase,
        acknowledgedAt: purchase.needsAcknowledgement ? null : now,
      },
      update: {
        productId: purchase.productId,
        interval: purchase.interval,
        subscriptionState: purchase.state,
        autoRenewing: purchase.autoRenewing,
        expiresAt: purchase.expiresAt,
        latestOrderId: purchase.latestOrderId,
        lastSyncedAt: now,
      },
    });

    if (purchase.linkedPurchaseToken) {
      await tx.playPurchase.updateMany({
        where: { purchaseToken: purchase.linkedPurchaseToken, workspaceId },
        data: { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", autoRenewing: false, lastSyncedAt: now },
      });
    }

    if (entitled && purchase.expiresAt) {
      const endsAt = otherProviderActive && otherProviderActive > purchase.expiresAt ? otherProviderActive : purchase.expiresAt;
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          subscriptionStatus: tier,
          planTier: tier,
          planInterval: purchase.interval,
          subscriptionEndsAt: endsAt,
          billingProvider: "GOOGLE_PLAY",
          billingContractType: "RECURRING",
          billingProviderId: null,
          billingProviderSubscriptionId: purchaseToken,
          // Cancellation is managed in Play; mirror Google's auto-renew flag.
          subscriptionCancelAtPeriodEnd: !purchase.autoRenewing,
          subscriptionCancelRequestedAt: purchase.autoRenewing ? null : now,
          subscriptionCancelEffectiveAt: purchase.autoRenewing ? null : endsAt,
          subscriptionCancellationLastError: null,
          hasEverSubscribed: true,
          signupIntentJson: null,
        },
      });

      // One ledger row per charge (latestOrderId changes on every renewal). A grace-period state means the
      // latest renewal charge failed, so nothing is recorded for it.
      if (purchase.latestOrderId && purchase.state !== "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
        const list = getListPriceForInterval(purchase.interval, "IN");
        await tx.billingTransaction.upsert({
          where: { workspaceId_providerReference: { workspaceId, providerReference: purchase.latestOrderId } },
          create: {
            workspaceId,
            amount: purchase.price?.amountMajor ?? list.amountMajor,
            status: "PAID",
            description: `Google Play subscription (${purchase.interval})`,
            providerReference: purchase.latestOrderId,
            transactionDate: now,
            subscriptionListAmount: purchase.price?.amountMajor ?? list.amountMajor,
            subscriptionCurrency: purchase.price?.currency ?? list.currency,
            subscriptionInterval: purchase.interval,
          },
          update: {},
        });
      }
    }
  });

  // Lost entitlement (expired, on hold, paused, refunded/revoked): downgrade only if THIS token is what
  // currently powers the workspace, never a newer token or another provider's subscription.
  if (
    !entitled &&
    purchase.state !== "SUBSCRIPTION_STATE_PENDING" &&
    purchase.state !== "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED" &&
    workspace.billingProvider === "GOOGLE_PLAY" &&
    workspace.billingProviderSubscriptionId === purchaseToken
  ) {
    await downgradeWorkspaceToFree(workspaceId, "subscription_expired");
  }

  if (entitled && purchase.needsAcknowledgement) {
    await acknowledgeSubscription(purchase.productId, purchaseToken);
    await prisma.playPurchase.update({ where: { purchaseToken }, data: { acknowledgedAt: new Date() } });
  }

  await logActivity({
    action: "billing.play_purchase_synced",
    status: "SUCCESS",
    workspaceId,
    actor: input.actor?.userId ? { userId: input.actor.userId, email: input.actor.email } : undefined,
    entity: { type: "workspace_subscription", id: purchaseToken.slice(0, 12) },
    metadata: { source: input.source, state: purchase.state, interval: purchase.interval, entitled, test: purchase.isTestPurchase },
  });

  return { ok: true, ignored: false, workspaceId, entitled, interval: purchase.interval, state: purchase.state, expiresAt: purchase.expiresAt };
}

/** Marks the ledger row of a refunded/voided order. Entitlement itself is handled by syncPlayPurchase. */
export async function markPlayOrderRefunded(orderId: string): Promise<void> {
  await prisma.billingTransaction.updateMany({
    where: { providerReference: orderId, status: "PAID" },
    data: { status: "REFUNDED" },
  });
}

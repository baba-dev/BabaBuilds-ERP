/**
 * Single source of truth for plan tiers, trial behavior, and feature gates.
 *
 * Invariants:
 * - `subscriptionStatus === "TRIALING"` — time-bound trial window (`subscriptionEndsAt`).
 * - `planTier` — feature tier for seats, storage, and UI (PRO/TEAM during trial after provision).
 */

import { prisma } from "@/lib/prisma";
import { downgradeWorkspaceToFree } from "@/lib/billing/downgrade";
import { FREE_TIER_CLIENT_LIMIT, FREE_TIER_MONTHLY_INVOICE_LIMIT, FREE_TIER_PUBLISHED_SERVICES_LIMIT } from "@/lib/pricing";
import {
  deserializeSignupIntent,
  signupIntentSchema,
  type SignupIntent,
} from "@/lib/signup-intent";

export type PublicPlanTier = "FREE" | "PRO" | "TEAM";

export type WorkspaceBillingSnapshot = {
  planTier?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
  signupIntentJson?: string | null;
};

export type WorkspaceBillingRow = WorkspaceBillingSnapshot & {
  id?: string;
};

export function normalizePlanTier(planTier: string | null | undefined): PublicPlanTier {
  const t = String(planTier ?? "FREE").toUpperCase();
  if (t === "PRO") return "PRO";
  if (t === "TEAM" || t === "ENTERPRISE") return "TEAM";
  return "FREE";
}

export function isTrialActive(snapshot: WorkspaceBillingSnapshot): boolean {
  if (String(snapshot.subscriptionStatus ?? "").toUpperCase() !== "TRIALING") return false;
  const end = snapshot.subscriptionEndsAt;
  if (!end) return false;
  return new Date(end).getTime() > Date.now();
}

/** Parse persisted workspace.signupIntentJson (plain JSON or legacy signed cookie value). */
export function parseStoredSignupIntent(json: string | null | undefined): SignupIntent | null {
  if (!json) return null;
  const fromCookie = deserializeSignupIntent(json);
  if (fromCookie) return fromCookie;
  try {
    return signupIntentSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export function planTierFromSignupIntent(intent: SignupIntent | null | undefined): PublicPlanTier {
  if (!intent) return "PRO";
  return intent.plan === "team" ? "TEAM" : "PRO";
}

/**
 * Effective tier for seats, document storage, and UI labels.
 * Active trial uses planTier when set (post-provision); falls back to stored signup intent.
 */
export function resolveEffectivePlanTier(
  snapshot: WorkspaceBillingSnapshot,
  signupIntentJson?: string | null,
): PublicPlanTier {
  if (isTrialActive(snapshot)) {
    const paid = normalizePlanTier(snapshot.planTier);
    if (paid !== "FREE") return paid;
    const intent = parseStoredSignupIntent(signupIntentJson ?? snapshot.signupIntentJson);
    return planTierFromSignupIntent(intent);
  }
  return normalizePlanTier(snapshot.planTier);
}

/** Key passed to getSeatLimit() in lib/permissions.ts */
export function resolveSeatLimitKey(
  snapshot: WorkspaceBillingSnapshot,
  signupIntentJson?: string | null,
): string {
  return resolveEffectivePlanTier(snapshot, signupIntentJson);
}

export function resolveBillingSnapshot(row: WorkspaceBillingRow): WorkspaceBillingSnapshot & {
  effectivePlanTier: PublicPlanTier;
  isTrialing: boolean;
  seatLimitKey: string;
} {
  const snapshot: WorkspaceBillingSnapshot = {
    planTier: row.planTier,
    subscriptionStatus: row.subscriptionStatus,
    subscriptionEndsAt: row.subscriptionEndsAt,
    signupIntentJson: row.signupIntentJson,
  };
  const trialing = isTrialActive(snapshot);
  const effectivePlanTier = resolveEffectivePlanTier(snapshot);
  return {
    ...snapshot,
    effectivePlanTier,
    isTrialing: trialing,
    seatLimitKey: effectivePlanTier,
  };
}

/** PRO/TEAM (Enterprise is normalized to Team for limits). */
export function isPaidPlanTier(planTier: string | null | undefined): boolean {
  const n = normalizePlanTier(planTier);
  return n === "PRO" || n === "TEAM";
}

/**
 * Paid product features (gateways, payment links, no free quotas): active trial OR paid tier.
 */
export function hasFullPaidFeatures(snapshot: WorkspaceBillingSnapshot): boolean {
  if (isTrialActive(snapshot)) return true;

  const status = String(snapshot.subscriptionStatus ?? "").toUpperCase();
  if (status !== "PRO" && status !== "TEAM") return false;
  if (!isPaidPlanTier(snapshot.planTier)) return false;

  // Paid access is time-bound. Fail closed when the end date is missing or stale.
  if (!snapshot.subscriptionEndsAt) return false;
  return new Date(snapshot.subscriptionEndsAt).getTime() > Date.now();
}

/**
 * Apply Free-tier limits (clients, invoice/month, shop listings): only when not in trial and tier is effectively FREE.
 */
export function shouldApplyFreeTierLimits(snapshot: WorkspaceBillingSnapshot): boolean {
  if (hasFullPaidFeatures(snapshot)) return false;
  return normalizePlanTier(snapshot.planTier) === "FREE";
}

export function canUsePaymentGateways(snapshot: WorkspaceBillingSnapshot): boolean {
  return hasFullPaidFeatures(snapshot);
}

/** Same rule as invoice PDF payment links and retainer automation payment links. */
export function canInjectGatewayPaymentLinks(snapshot: WorkspaceBillingSnapshot): boolean {
  return hasFullPaidFeatures(snapshot);
}

export { FREE_TIER_CLIENT_LIMIT, FREE_TIER_MONTHLY_INVOICE_LIMIT, FREE_TIER_PUBLISHED_SERVICES_LIMIT };

/** Calendar month bounds in UTC for the given instant (for consistent server-side monthly caps). */
export function utcCalendarMonthRange(ref: Date): { start: Date; endExclusive: Date } {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

export type InvoiceLimitDenied = {
  code: "FREE_TIER_INVOICE_MONTH_LIMIT";
  message: string;
  limit: number;
};

export async function evaluateMonthlyInvoiceLimit(params: {
  snapshot: WorkspaceBillingSnapshot;
  workspaceId: string;
  invoiceMonthRef: Date;
  countInMonth: (range: { start: Date; endExclusive: Date }) => Promise<number>;
}): Promise<InvoiceLimitDenied | null> {
  if (!shouldApplyFreeTierLimits(params.snapshot)) return null;
  const { start, endExclusive } = utcCalendarMonthRange(params.invoiceMonthRef);
  const count = await params.countInMonth({ start, endExclusive });
  if (count < FREE_TIER_MONTHLY_INVOICE_LIMIT) return null;
  return {
    code: "FREE_TIER_INVOICE_MONTH_LIMIT",
    message: `You have reached the limit of ${FREE_TIER_MONTHLY_INVOICE_LIMIT} invoices this month on the Free plan. Upgrade to Pro or Team for unlimited invoices.`,
    limit: FREE_TIER_MONTHLY_INVOICE_LIMIT,
  };
}

function isExpiredStatusRow(
  snapshot: WorkspaceBillingSnapshot,
  statuses: readonly string[],
): boolean {
  if (!statuses.includes(String(snapshot.subscriptionStatus ?? "").toUpperCase())) return false;
  const end = snapshot.subscriptionEndsAt;
  if (!end) return false;
  return new Date(end).getTime() <= Date.now();
}

/**
 * Lazy reconciliation for expired trials and paid terms.
 * All callers see FREE entitlements immediately after the paid end timestamp.
 */
export async function normalizeExpiredWorkspaceSubscription(workspaceId: string): Promise<void> {
  const row = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { subscriptionStatus: true, subscriptionEndsAt: true },
  });
  if (!row) return;

  if (isExpiredStatusRow(row, ["TRIALING"])) {
    await downgradeWorkspaceToFree(workspaceId, "trial_expired");
    return;
  }

  if (isExpiredStatusRow(row, ["PRO", "TEAM"])) {
    await downgradeWorkspaceToFree(workspaceId, "subscription_expired");
  }
}

/** @deprecated Use normalizeExpiredWorkspaceSubscription(). */
export async function normalizeExpiredTrialWorkspace(workspaceId: string): Promise<void> {
  await normalizeExpiredWorkspaceSubscription(workspaceId);
}

export async function loadWorkspaceBillingSnapshot(workspaceId: string): Promise<WorkspaceBillingSnapshot | null> {
  await normalizeExpiredWorkspaceSubscription(workspaceId);
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      planTier: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      signupIntentJson: true,
    },
  });
}

/** Enforces Free-tier monthly invoice cap (UTC calendar month); returns null if allowed. */
export type PublishedShopLimitDenied = {
  code: "FREE_TIER_PUBLISHED_SERVICES_LIMIT";
  message: string;
  limit: number;
};

export async function assertFreeTierPublishedShopListingsAllowed(
  workspaceId: string,
): Promise<PublishedShopLimitDenied | null> {
  const snap = await loadWorkspaceBillingSnapshot(workspaceId);
  if (!snap || !shouldApplyFreeTierLimits(snap)) return null;
  const publishedCount = await prisma.product.count({
    where: { workspaceId, showInShop: true },
  });
  if (publishedCount < FREE_TIER_PUBLISHED_SERVICES_LIMIT) return null;
  return {
    code: "FREE_TIER_PUBLISHED_SERVICES_LIMIT",
    message: `You have reached the limit of ${FREE_TIER_PUBLISHED_SERVICES_LIMIT} published shop listings on the Free plan. Upgrade to publish more.`,
    limit: FREE_TIER_PUBLISHED_SERVICES_LIMIT,
  };
}

export async function assertFreeTierMonthlyInvoiceAllowed(
  workspaceId: string,
  invoiceMonthRef: Date,
): Promise<InvoiceLimitDenied | null> {
  const snap = await loadWorkspaceBillingSnapshot(workspaceId);
  if (!snap) return null;
  return evaluateMonthlyInvoiceLimit({
    snapshot: snap,
    workspaceId,
    invoiceMonthRef,
    countInMonth: async ({ start, endExclusive }) =>
      prisma.invoice.count({
        where: {
          workspaceId,
          invoiceDate: { gte: start, lt: endExclusive },
        },
      }),
  });
}

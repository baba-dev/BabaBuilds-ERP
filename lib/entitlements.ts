/**
 * Single source of truth for plan tiers, trial behavior, and feature gates.
 *
 * Trial: While `subscriptionStatus === "TRIALING"` and `subscriptionEndsAt` is in the future,
 * the workspace gets paid-tier feature access (payment gateways, no free-tier quotas), even if `planTier` is still FREE.
 */

import { prisma } from "@/lib/prisma";
import { FREE_TIER_CLIENT_LIMIT, FREE_TIER_MONTHLY_INVOICE_LIMIT, FREE_TIER_PUBLISHED_SERVICES_LIMIT } from "@/lib/pricing";

export type PublicPlanTier = "FREE" | "PRO" | "TEAM";

export type WorkspaceBillingSnapshot = {
  planTier?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
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
  return isPaidPlanTier(snapshot.planTier);
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

export async function loadWorkspaceBillingSnapshot(workspaceId: string): Promise<WorkspaceBillingSnapshot | null> {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { planTier: true, subscriptionStatus: true, subscriptionEndsAt: true },
  });
}

/** Enforces Free-tier monthly invoice cap (UTC calendar month); returns null if allowed. */
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

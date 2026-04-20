import type { Prisma } from "@prisma/client";
import { DistributorMarginBasis } from "@prisma/client";
import { decimalToNumber } from "@/lib/distributor-coupon";
import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";
import { tierFromInterval } from "@/lib/subscription-checkout";

export type Tier = "PRO" | "TEAM";

export function intervalTier(interval: SubscriptionIntervalKey): Tier {
  return tierFromInterval(interval);
}

function parseAllowedTiers(allowedTiers: string): Set<Tier> | "ALL" {
  const s = (allowedTiers || "ALL").toUpperCase().trim();
  if (s === "ALL" || s === "") return "ALL";
  const parts = s.split(",").map((p) => p.trim().toUpperCase());
  const set = new Set<Tier>();
  for (const p of parts) {
    if (p === "PRO" || p === "TEAM") set.add(p);
  }
  return set;
}

export function couponAllowsTier(allowedTiers: string, interval: SubscriptionIntervalKey): boolean {
  const t = intervalTier(interval);
  const allowed = parseAllowedTiers(allowedTiers);
  if (allowed === "ALL") return true;
  return allowed.has(t);
}

export function couponIsInValidityWindow(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

export function getMarginPercentForInterval(
  distributor: {
    defaultMarginPercent: Prisma.Decimal | number;
    marginByPlanJson: Prisma.JsonValue | null;
  },
  interval: SubscriptionIntervalKey,
): number {
  const raw = distributor.marginByPlanJson;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const v = (raw as Record<string, unknown>)[interval];
    if (typeof v === "number") return v;
    if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  }
  return decimalToNumber(distributor.defaultMarginPercent);
}

export function resolveEffectiveMargin(
  distributor: {
    defaultMarginPercent: Prisma.Decimal | number;
    defaultMarginBasis: DistributorMarginBasis;
    marginByPlanJson: Prisma.JsonValue | null;
  },
  coupon: {
    marginPercent: Prisma.Decimal | number;
    marginBasis: DistributorMarginBasis | null;
  } | null,
  interval: SubscriptionIntervalKey,
): { marginPercent: number; marginBasis: DistributorMarginBasis } {
  const pct = getMarginPercentForInterval(
    {
      ...distributor,
      defaultMarginPercent: coupon ? coupon.marginPercent : distributor.defaultMarginPercent,
    },
    interval,
  );
  const basis = coupon?.marginBasis ?? distributor.defaultMarginBasis;
  return { marginPercent: pct, marginBasis: basis };
}

export function computeCommissionAmount(
  listAmount: number,
  paidAmount: number,
  marginPercent: number,
  basis: DistributorMarginBasis,
): number {
  const base = basis === DistributorMarginBasis.PAID ? paidAmount : listAmount;
  return Number(((base * marginPercent) / 100).toFixed(2));
}

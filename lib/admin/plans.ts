import type { Prisma } from "@prisma/client";

export const PLAN_ACTIONS = ["SET_PLAN", "EXTEND", "GRANT_TRIAL", "SET_FREE", "SUSPEND", "REACTIVATE"] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

export type PlanInterval = "MONTHLY" | "QUARTERLY" | "YEARLY" | "TEAM_MONTHLY" | "TEAM_YEARLY";

const INTERVAL_DAYS: Record<PlanInterval, number> = { MONTHLY: 30, QUARTERLY: 90, YEARLY: 365, TEAM_MONTHLY: 30, TEAM_YEARLY: 365 };
const DAY = 86_400_000;

export type WorkspacePlanState = { subscriptionStatus: string; planTier: string; subscriptionEndsAt: Date | null; planInterval: string | null };

export type PlanRequest = { action: PlanAction; plan?: "PRO" | "TEAM"; interval?: PlanInterval; days?: number };

export type PlanChange = { data: Prisma.WorkspaceUpdateInput; summary: string };
export type PlanChangeError = { error: string; code: "INVALID_DAYS" | "INVALID_PLAN" | "NOT_PAID" | "NOT_SUSPENDED" | "ALREADY_SUSPENDED" };

const isPaidTier = (t: string) => t === "PRO" || t === "TEAM";
export const validDays = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 730;

/**
 * What a plan action writes. Paid access is time-bound (see hasFullPaidFeatures), so every action that grants access also
 * sets the end date: the old "upgrade" changed the status but left the end date empty, which granted nothing.
 */
export function planChange(req: PlanRequest, current: WorkspacePlanState, now = new Date()): PlanChange | PlanChangeError {
  const endsIn = (days: number) => new Date(now.getTime() + days * DAY);
  switch (req.action) {
    case "SET_PLAN": {
      if (req.plan !== "PRO" && req.plan !== "TEAM") return { error: "Choose Pro or Team.", code: "INVALID_PLAN" };
      const interval: PlanInterval = req.interval ?? (req.plan === "TEAM" ? "TEAM_MONTHLY" : "MONTHLY");
      const days = req.days ?? INTERVAL_DAYS[interval];
      if (!validDays(days)) return { error: "Days must be a whole number from 1 to 730.", code: "INVALID_DAYS" };
      return { data: { subscriptionStatus: req.plan, planTier: req.plan, planInterval: interval, subscriptionEndsAt: endsIn(days), subscriptionCancelAtPeriodEnd: false }, summary: `Set plan to ${req.plan} for ${days} days` };
    }
    case "EXTEND": {
      if (!validDays(req.days)) return { error: "Days must be a whole number from 1 to 730.", code: "INVALID_DAYS" };
      const live = current.subscriptionStatus === "TRIALING" || isPaidTier(current.subscriptionStatus);
      if (!live) return { error: "Only a paid or trialing workspace can be extended. Set a plan instead.", code: "NOT_PAID" };
      // Extend from the later of now and the current end, so extending an expired plan does not stay expired.
      const from = current.subscriptionEndsAt && current.subscriptionEndsAt.getTime() > now.getTime() ? current.subscriptionEndsAt : now;
      return { data: { subscriptionEndsAt: new Date(from.getTime() + req.days * DAY) }, summary: `Extended by ${req.days} days` };
    }
    case "GRANT_TRIAL": {
      if (!validDays(req.days)) return { error: "Days must be a whole number from 1 to 730.", code: "INVALID_DAYS" };
      return { data: { subscriptionStatus: "TRIALING", planTier: isPaidTier(current.planTier) ? current.planTier : "PRO", subscriptionEndsAt: endsIn(req.days) }, summary: `Granted a ${req.days}-day trial` };
    }
    case "SET_FREE":
      return { data: { subscriptionStatus: "FREE", planTier: "FREE", subscriptionEndsAt: null, planInterval: null }, summary: "Moved to Free" };
    case "SUSPEND":
      if (current.subscriptionStatus === "SUSPENDED") return { error: "Already suspended.", code: "ALREADY_SUSPENDED" };
      return { data: { subscriptionStatus: "SUSPENDED" }, summary: "Suspended" };
    case "REACTIVATE": {
      if (current.subscriptionStatus !== "SUSPENDED") return { error: "This workspace is not suspended.", code: "NOT_SUSPENDED" };
      const stillPaid = isPaidTier(current.planTier) && !!current.subscriptionEndsAt && current.subscriptionEndsAt.getTime() > now.getTime();
      // A plan that ran out while suspended must not come back as "PRO" with no entitlement behind it.
      return stillPaid ? { data: { subscriptionStatus: current.planTier }, summary: `Reactivated on ${current.planTier}` } : { data: { subscriptionStatus: "FREE", planTier: "FREE", subscriptionEndsAt: null }, summary: "Reactivated on Free (the plan had ended)" };
    }
  }
}

/** Effective access, the way the app computes it, so the console can show a mismatch with the stored status. */
export function effectiveAccess(s: WorkspacePlanState, now = new Date()): "TRIAL" | "PAID" | "EXPIRED_PAID" | "EXPIRED_TRIAL" | "FREE" | "SUSPENDED" {
  if (s.subscriptionStatus === "SUSPENDED") return "SUSPENDED";
  const live = !!s.subscriptionEndsAt && s.subscriptionEndsAt.getTime() > now.getTime();
  if (s.subscriptionStatus === "TRIALING") return live ? "TRIAL" : "EXPIRED_TRIAL";
  if (isPaidTier(s.subscriptionStatus)) return live ? "PAID" : "EXPIRED_PAID";
  return "FREE";
}

import { describe, expect, it } from "vitest";
import { effectiveAccess, planChange, type WorkspacePlanState } from "@/lib/admin/plans";
import { hasFullPaidFeatures } from "@/lib/entitlements";

const NOW = new Date("2026-11-10T00:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const free: WorkspacePlanState = { subscriptionStatus: "FREE", planTier: "FREE", subscriptionEndsAt: null, planInterval: null };
const ok = (r: ReturnType<typeof planChange>) => { if ("error" in r) throw new Error(r.error); return r.data as Record<string, unknown>; };

describe("plan changes", () => {
  it("setting a plan sets the end date, which is what actually grants paid access", () => {
    const data = ok(planChange({ action: "SET_PLAN", plan: "PRO" }, free, NOW));
    expect(data).toMatchObject({ subscriptionStatus: "PRO", planTier: "PRO", planInterval: "MONTHLY" });
    expect((data.subscriptionEndsAt as Date).getTime()).toBe(day(30).getTime());
    // The app's own rule agrees: this workspace now has paid features. (The old action left the end date empty and granted nothing.)
    expect(hasFullPaidFeatures({ planTier: "PRO", subscriptionStatus: "PRO", subscriptionEndsAt: data.subscriptionEndsAt as Date })).toBe(true);
    expect(hasFullPaidFeatures({ planTier: "PRO", subscriptionStatus: "PRO", subscriptionEndsAt: null })).toBe(false);
  });

  it("uses the interval for the length unless days are given, and rejects silly lengths", () => {
    expect((ok(planChange({ action: "SET_PLAN", plan: "TEAM", interval: "TEAM_YEARLY" }, free, NOW)).subscriptionEndsAt as Date).getTime()).toBe(day(365).getTime());
    expect((ok(planChange({ action: "SET_PLAN", plan: "PRO", days: 10 }, free, NOW)).subscriptionEndsAt as Date).getTime()).toBe(day(10).getTime());
    expect(planChange({ action: "SET_PLAN", plan: "PRO", days: 0 }, free, NOW)).toMatchObject({ code: "INVALID_DAYS" });
    expect(planChange({ action: "SET_PLAN", plan: "PRO", days: 5000 }, free, NOW)).toMatchObject({ code: "INVALID_DAYS" });
    expect(planChange({ action: "SET_PLAN" }, free, NOW)).toMatchObject({ code: "INVALID_PLAN" });
  });

  it("extends from the later of now and the current end, so an expired plan does not stay expired", () => {
    const live: WorkspacePlanState = { subscriptionStatus: "PRO", planTier: "PRO", subscriptionEndsAt: day(10), planInterval: "MONTHLY" };
    expect((ok(planChange({ action: "EXTEND", days: 5 }, live, NOW)).subscriptionEndsAt as Date).getTime()).toBe(day(15).getTime());
    const expired = { ...live, subscriptionEndsAt: day(-20) };
    expect((ok(planChange({ action: "EXTEND", days: 5 }, expired, NOW)).subscriptionEndsAt as Date).getTime()).toBe(day(5).getTime());
    expect(planChange({ action: "EXTEND", days: 5 }, free, NOW)).toMatchObject({ code: "NOT_PAID" });
  });

  it("grants a trial on a paid tier and moves back to free cleanly", () => {
    expect(ok(planChange({ action: "GRANT_TRIAL", days: 14 }, free, NOW))).toMatchObject({ subscriptionStatus: "TRIALING", planTier: "PRO" });
    expect(ok(planChange({ action: "SET_FREE" }, { ...free, subscriptionStatus: "PRO", planTier: "PRO", subscriptionEndsAt: day(5) }, NOW))).toMatchObject({ subscriptionStatus: "FREE", planTier: "FREE", subscriptionEndsAt: null });
  });

  it("suspend and reactivate: a plan that ended while suspended comes back as Free, not a fake PRO", () => {
    const paid: WorkspacePlanState = { subscriptionStatus: "PRO", planTier: "PRO", subscriptionEndsAt: day(10), planInterval: "MONTHLY" };
    expect(ok(planChange({ action: "SUSPEND" }, paid, NOW))).toEqual({ subscriptionStatus: "SUSPENDED" });
    expect(planChange({ action: "SUSPEND" }, { ...paid, subscriptionStatus: "SUSPENDED" }, NOW)).toMatchObject({ code: "ALREADY_SUSPENDED" });
    const suspendedLive = { ...paid, subscriptionStatus: "SUSPENDED" };
    expect(ok(planChange({ action: "REACTIVATE" }, suspendedLive, NOW))).toEqual({ subscriptionStatus: "PRO" });
    const suspendedEnded = { ...suspendedLive, subscriptionEndsAt: day(-1) };
    expect(ok(planChange({ action: "REACTIVATE" }, suspendedEnded, NOW))).toMatchObject({ subscriptionStatus: "FREE", planTier: "FREE" });
    expect(planChange({ action: "REACTIVATE" }, paid, NOW)).toMatchObject({ code: "NOT_SUSPENDED" });
  });
});

describe("effective access (what the badge shows)", () => {
  it("separates live from expired, and shows a stored PRO with no end date as expired", () => {
    const s = (status: string, ends: Date | null): WorkspacePlanState => ({ subscriptionStatus: status, planTier: status === "TRIALING" ? "PRO" : status, subscriptionEndsAt: ends, planInterval: null });
    expect(effectiveAccess(s("PRO", day(3)), NOW)).toBe("PAID");
    expect(effectiveAccess(s("PRO", null), NOW)).toBe("EXPIRED_PAID");
    expect(effectiveAccess(s("TEAM", day(-1)), NOW)).toBe("EXPIRED_PAID");
    expect(effectiveAccess(s("TRIALING", day(2)), NOW)).toBe("TRIAL");
    expect(effectiveAccess(s("TRIALING", day(-2)), NOW)).toBe("EXPIRED_TRIAL");
    expect(effectiveAccess(s("SUSPENDED", day(9)), NOW)).toBe("SUSPENDED");
    expect(effectiveAccess(s("FREE", null), NOW)).toBe("FREE");
  });
});

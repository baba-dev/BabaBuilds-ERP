import { describe, expect, it } from "vitest";
import {
  hasFullPaidFeatures,
  isTrialActive,
  parseStoredSignupIntent,
  planTierFromSignupIntent,
  resolveEffectivePlanTier,
  resolveSeatLimitKey,
  shouldApplyFreeTierLimits,
} from "@/lib/entitlements";
import { signupIntentSchema } from "@/lib/signup-intent";

describe("trial entitlements", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  const activeTrialPro = {
    planTier: "PRO",
    subscriptionStatus: "TRIALING",
    subscriptionEndsAt: future,
  };

  const activeTrialTeamIntent = {
    planTier: "FREE",
    subscriptionStatus: "TRIALING",
    subscriptionEndsAt: future,
    signupIntentJson: JSON.stringify(
      signupIntentSchema.parse({ plan: "team", cycle: "annual", trial: 15 }),
    ),
  };

  const expiredTrial = {
    planTier: "FREE",
    subscriptionStatus: "TRIALING",
    subscriptionEndsAt: past,
  };

  const paidPro = { planTier: "PRO", subscriptionStatus: "PRO", subscriptionEndsAt: future };
  const free = { planTier: "FREE", subscriptionStatus: "FREE", subscriptionEndsAt: null };

  it("detects active vs expired trial", () => {
    expect(isTrialActive(activeTrialPro)).toBe(true);
    expect(isTrialActive(expiredTrial)).toBe(false);
  });

  it("grants paid features during active trial only", () => {
    expect(hasFullPaidFeatures(activeTrialPro)).toBe(true);
    expect(hasFullPaidFeatures(expiredTrial)).toBe(false);
    expect(shouldApplyFreeTierLimits(activeTrialPro)).toBe(false);
    expect(shouldApplyFreeTierLimits(expiredTrial)).toBe(true);
  });

  it("resolves effective plan tier from planTier or stored intent", () => {
    expect(resolveEffectivePlanTier(activeTrialPro)).toBe("PRO");
    expect(resolveEffectivePlanTier(activeTrialTeamIntent)).toBe("TEAM");
    expect(resolveEffectivePlanTier(paidPro)).toBe("PRO");
    expect(resolveEffectivePlanTier(free)).toBe("FREE");
  });

  it("resolveSeatLimitKey matches effective tier", () => {
    expect(resolveSeatLimitKey(activeTrialTeamIntent)).toBe("TEAM");
    expect(resolveSeatLimitKey(free)).toBe("FREE");
  });

  it("parseStoredSignupIntent reads JSON", () => {
    const intent = signupIntentSchema.parse({ plan: "pro", cycle: "monthly", trial: 30 });
    expect(parseStoredSignupIntent(JSON.stringify(intent))?.trial).toBe(30);
    expect(planTierFromSignupIntent(intent)).toBe("PRO");
    expect(planTierFromSignupIntent({ ...intent, plan: "team" })).toBe("TEAM");
  });
});

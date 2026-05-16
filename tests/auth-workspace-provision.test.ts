import { describe, expect, it } from "vitest";
import {
  buildTrialWorkspaceCreateData,
  computeTrialEndDate,
  defaultSignupIntent,
  sanitizeSignupIntent,
  signupIntentToPlanInterval,
} from "@/lib/auth-workspace-provision";
import { signupIntentSchema } from "@/lib/signup-intent";

describe("auth workspace provision", () => {
  it("preserves trial days from intent", () => {
    const intent = signupIntentSchema.parse({ plan: "pro", cycle: "monthly", trial: 30 });
    const sanitized = sanitizeSignupIntent(intent);
    expect(sanitized?.trial).toBe(30);
  });

  it("maps team annual intent to plan tier and interval", () => {
    const intent = signupIntentSchema.parse({ plan: "team", cycle: "annual", trial: 15 });
    const data = buildTrialWorkspaceCreateData({
      userId: "u1",
      businessName: "Acme",
      signupIntent: intent,
    });
    expect(data.planTier).toBe("TEAM");
    expect(data.subscriptionStatus).toBe("TRIALING");
    expect(signupIntentToPlanInterval(intent)).toMatch(/YEAR|ANNUAL/i);
  });

  it("defaults to pro monthly trial", () => {
    const data = buildTrialWorkspaceCreateData({
      userId: "u1",
      businessName: "Test Co",
      signupIntent: null,
    });
    expect(data.planTier).toBe("PRO");
    const end = data.subscriptionEndsAt as Date;
    const defaultEnd = computeTrialEndDate(defaultSignupIntent().trial);
    expect(Math.abs(end.getTime() - defaultEnd.getTime())).toBeLessThan(2000);
  });
});

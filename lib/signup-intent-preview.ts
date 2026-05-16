import { cookies } from "next/headers";
import { deserializeSignupIntent, SIGNUP_INTENT_COOKIE, type SignupIntent } from "@/lib/signup-intent";
import { sanitizeSignupIntent, computeTrialEndDate } from "@/lib/auth-workspace-provision";
import { planTierFromSignupIntent } from "@/lib/entitlements";

export type SignupIntentPreview = {
  intent: SignupIntent;
  planLabel: string;
  trialDays: number;
  trialEndsAt: Date;
};

export async function readSignupIntentPreview(): Promise<SignupIntentPreview | null> {
  const store = await cookies();
  const raw = store.get(SIGNUP_INTENT_COOKIE)?.value;
  const parsed = sanitizeSignupIntent(deserializeSignupIntent(raw));
  if (!parsed) return null;

  const tier = planTierFromSignupIntent(parsed);
  return {
    intent: parsed,
    planLabel: tier === "TEAM" ? "Team" : "Pro",
    trialDays: parsed.trial,
    trialEndsAt: computeTrialEndDate(parsed.trial),
  };
}

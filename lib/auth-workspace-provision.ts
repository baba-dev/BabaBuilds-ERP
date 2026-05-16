import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { planTierFromSignupIntent } from "@/lib/entitlements";
import { getPlanInterval, type BillingCycle, type PlanId } from "@/lib/pricing";
import type { SignupIntent } from "@/lib/signup-intent";

export const DEFAULT_TRIAL_DAYS = 15;

const ALLOWED_PLANS = new Set(["pro", "team"] as const);
const ALLOWED_CYCLES = new Set(["monthly", "annual"] as const);

export function sanitizeSignupIntent(intent: SignupIntent | null | undefined): SignupIntent | null {
  if (!intent) return null;
  return {
    ...intent,
    plan: ALLOWED_PLANS.has(intent.plan) ? intent.plan : "pro",
    cycle: ALLOWED_CYCLES.has(intent.cycle) ? intent.cycle : "monthly",
    trial: Math.min(30, Math.max(1, intent.trial ?? DEFAULT_TRIAL_DAYS)),
  };
}

export function computeTrialEndDate(trialDays: number): Date {
  const end = new Date();
  end.setDate(end.getDate() + trialDays);
  return end;
}

export function signupIntentToPlanInterval(intent: SignupIntent | null | undefined): string {
  const safe = sanitizeSignupIntent(intent) ?? {
    plan: "pro" as const,
    cycle: "monthly" as const,
    trial: DEFAULT_TRIAL_DAYS,
  };
  const planId: PlanId = safe.plan === "team" ? "team" : "pro";
  const cycle: BillingCycle = safe.cycle === "annual" ? "annual" : "monthly";
  return getPlanInterval(planId, cycle);
}

export function defaultSignupIntent(): SignupIntent {
  return { plan: "pro", cycle: "monthly", trial: DEFAULT_TRIAL_DAYS };
}

export function buildTrialWorkspaceCreateData(params: {
  userId: string;
  businessName: string;
  signupIntent: SignupIntent | null | undefined;
}) {
  const intent = sanitizeSignupIntent(params.signupIntent) ?? defaultSignupIntent();
  return {
    name: params.businessName,
    subscriptionStatus: "TRIALING",
    subscriptionEndsAt: computeTrialEndDate(intent.trial),
    planTier: planTierFromSignupIntent(intent),
    planInterval: signupIntentToPlanInterval(intent),
    signupIntentJson: JSON.stringify(intent),
    users: { create: { userId: params.userId, role: "OWNER" as const } },
  };
}

export async function provisionTrialWorkspace(params: {
  userId: string;
  email?: string | null;
  name?: string | null;
  signupIntent: SignupIntent | null | undefined;
  source: string;
}): Promise<string> {
  const existingMembership = await prisma.workspaceUser.findFirst({
    where: { userId: params.userId },
    select: { workspaceId: true },
  });
  if (existingMembership?.workspaceId) {
    return existingMembership.workspaceId;
  }

  const label =
    params.name?.split(" ")[0] || params.email?.split("@")[0] || "My";

  const workspace = await prisma.workspace.create({
    data: buildTrialWorkspaceCreateData({
      userId: params.userId,
      businessName: `${label} Business`,
      signupIntent: params.signupIntent,
    }),
    select: { id: true },
  });

  const intent = sanitizeSignupIntent(params.signupIntent) ?? defaultSignupIntent();

  if (intent.persona) {
    await prisma.userOnboarding.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId, persona: intent.persona },
      update: { persona: intent.persona },
    });
  }

  logActivity({
    action: "workspace_bootstrap",
    outcome: "success",
    entityType: "workspace",
    entityId: workspace.id,
    workspaceId: workspace.id,
    actorId: params.userId,
    actorEmail: params.email ?? null,
    metadata: {
      source: params.source,
      plan: intent.plan,
      trialDays: intent.trial,
      persona: intent.persona ?? null,
      signupSource: intent.source ?? null,
    },
  });

  return workspace.id;
}

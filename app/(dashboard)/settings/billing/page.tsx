import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import BillingSettingsClient from "./BillingSettingsClient";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  normalizeExpiredWorkspaceSubscription,
  parseStoredSignupIntent,
} from "@/lib/entitlements";
import { getPlanInterval, type BillingCycle, type PlanId } from "@/lib/pricing";

type WorkspaceSummary = {
  planInterval: string | null;
  planTier: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
  billingProviderId: string | null;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionCancelEffectiveAt: Date | null;
  countryCode: string | null;
  baseCurrency: string | null;
  signupIntentJson?: string | null;
  _count: { clients: number };
};

export default async function BillingSettingsPage() {
  const session = await getServerSession(authOptions);
  const scopedSession = session as (typeof session & {
    workspaceId?: string;
    locale?: string;
    baseCurrency?: string;
    user?: { id?: string; currencyFormat?: string };
  }) | null;

  if (!scopedSession?.workspaceId || !scopedSession.user?.id) {
    redirect("/");
  }

  try {
    await requirePermission(
      scopedSession.user.id,
      scopedSession.workspaceId,
      "billing.manage",
    );
  } catch {
    redirect("/access-denied");
  }

  await normalizeExpiredWorkspaceSubscription(scopedSession.workspaceId);

  const locale = scopedSession.locale || "en-IN";
  const currency = scopedSession.user?.currencyFormat || scopedSession.baseCurrency || "INR";

  const workspace = await prisma.workspace.findUnique({
    where: { id: scopedSession.workspaceId },
    select: {
      planInterval: true,
      planTier: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      billingProviderId: true,
      subscriptionCancelAtPeriodEnd: true,
      subscriptionCancelEffectiveAt: true,
      countryCode: true,
      baseCurrency: true,
      signupIntentJson: true,
      _count: { select: { clients: true } },
    },
  });

  if (!workspace) {
    redirect("/dashboard");
  }

  const workspaceSummary: WorkspaceSummary = {
    planInterval: workspace.planInterval,
    planTier: workspace.planTier ?? "FREE",
    subscriptionStatus: workspace.subscriptionStatus,
    subscriptionEndsAt: workspace.subscriptionEndsAt,
    billingProviderId: workspace.billingProviderId,
    subscriptionCancelAtPeriodEnd: workspace.subscriptionCancelAtPeriodEnd,
    subscriptionCancelEffectiveAt: workspace.subscriptionCancelEffectiveAt,
    countryCode: workspace.countryCode,
    baseCurrency: workspace.baseCurrency,
    _count: { clients: workspace._count.clients },
  };

  const storedIntent = parseStoredSignupIntent(workspace.signupIntentJson ?? null);
  const defaultPlanId: PlanId = storedIntent?.plan === "team" ? "team" : "pro";
  const defaultBillingCycle: BillingCycle =
    storedIntent?.cycle === "annual" ? "annual" : "monthly";
  const defaultInterval = getPlanInterval(defaultPlanId, defaultBillingCycle);

  return (
    <BillingSettingsClient
      locale={locale}
      currency={currency}
      workspace={workspaceSummary}
      defaultUpgradeInterval={defaultInterval}
    />
  );
}

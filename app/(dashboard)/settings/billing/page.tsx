import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import BillingSettingsClient from "./BillingSettingsClient";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type WorkspaceSummary = {
  planInterval: string | null;
  planTier: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
  billingProviderId: string | null;
  countryCode: string;
  baseCurrency: string;
  _count: { clients: number };
};

export default async function BillingSettingsPage() {
  const session = await getServerSession(authOptions);
  const scopedSession = session as (typeof session & {
    workspaceId?: string;
    locale?: string;
    baseCurrency?: string;
    user?: { currencyFormat?: string };
  }) | null;

  if (!scopedSession?.workspaceId) {
    redirect("/");
  }

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
      countryCode: true,
      baseCurrency: true,
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
    countryCode: workspace.countryCode,
    baseCurrency: workspace.baseCurrency,
    _count: { clients: workspace._count.clients },
  };

  return (
    <BillingSettingsClient
      locale={locale}
      currency={currency}
      workspace={workspaceSummary}
    />
  );
}

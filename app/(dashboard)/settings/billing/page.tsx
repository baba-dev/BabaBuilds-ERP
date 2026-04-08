import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import BillingSettingsClient from "./BillingSettingsClient";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type WorkspaceSummary = {
  planInterval: string | null;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
  billingProviderId: string | null;
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
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      billingProviderId: true,
      _count: { select: { clients: true } },
    },
  });

  if (!workspace) {
    redirect("/dashboard");
  }

  const workspaceSummary: WorkspaceSummary = {
    planInterval: workspace.planInterval,
    subscriptionStatus: workspace.subscriptionStatus,
    subscriptionEndsAt: workspace.subscriptionEndsAt,
    billingProviderId: workspace.billingProviderId,
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

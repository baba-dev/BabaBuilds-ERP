import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import BillingSettingsClient from "./BillingSettingsClient";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const currency =
    scopedSession.user?.currencyFormat ||
    scopedSession.baseCurrency ||
    "INR";

  const workspaceRecord = await prisma.workspace.findUnique({
    where: { id: scopedSession.workspaceId },
    select: {
      planInterval: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      billingProviderId: true,
      _count: { select: { clients: true } },
    },
  });

  if (!workspaceRecord) {
    redirect("/dashboard");
  }

  const workspace = {
    planInterval: workspaceRecord.planInterval,
    subscriptionStatus: workspaceRecord.subscriptionStatus,
    subscriptionEndsAt: workspaceRecord.subscriptionEndsAt,
    billingProviderId: workspaceRecord.billingProviderId,
    _count: {
      clients: workspaceRecord._count.clients,
    },
  };

  return (
    <BillingSettingsClient
      locale={locale}
      currency={currency}
      workspace={workspace}
    />
  );
}

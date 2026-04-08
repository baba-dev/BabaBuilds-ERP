import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import BillingSettingsClient from "./BillingSettingsClient";

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

  const workspaceId = scopedSession.workspaceId;
  const locale = scopedSession.locale || "en-IN";
  const currency =
    scopedSession.user?.currencyFormat ||
    scopedSession.baseCurrency ||
    "INR";

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      planInterval: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      billingProviderId: true,
      _count: { select: { clients: true } },
    },
  });

  if (!workspace) redirect("/dashboard");

  return (
    <BillingSettingsClient
      locale={locale}
      currency={currency}
      workspace={workspace}
    />
  );
}

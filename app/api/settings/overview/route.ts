import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUsePaymentGateways, loadWorkspaceBillingSnapshot } from "@/lib/entitlements";
import { buildOverview } from "@/lib/settings/overview";

/** Setup checklist for the workspace. Reports whether secrets are set, never their values. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  if (!session || !workspaceId || !session.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, workspace, members, billing] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { workspaceId } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } }),
    prisma.workspaceUser.count({ where: { workspaceId, isActive: true } }),
    loadWorkspaceBillingSnapshot(workspaceId),
  ]);

  const result = buildOverview({
    countryCode: workspace?.countryCode ?? "IN",
    gatewaysEntitled: billing ? canUsePaymentGateways(billing) : false,
    activeMembers: members,
    profile: profile && {
      ...profile,
      hasBankAccountNumber: !!profile.accountNumber || !!profile.primaryBankAccountId,
      hasSmtpPassword: !!profile.smtpPassword,
      hasRazorpayKeySecret: !!profile.razorpayKeySecret,
      hasStripeSecretKey: !!profile.stripeSecretKey,
    },
  });
  return NextResponse.json(result);
}

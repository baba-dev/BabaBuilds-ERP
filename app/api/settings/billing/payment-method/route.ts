import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;
    const [workspace, profile] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { paymentMethodMask: true, billingProviderId: true },
      }),
      prisma.businessProfile.findUnique({
        where: { workspaceId },
        select: { razorpayKeyId: true, stripePublishableKey: true },
      }),
    ]);

    const provider = profile?.stripePublishableKey
      ? "STRIPE"
      : profile?.razorpayKeyId
        ? "RAZORPAY"
        : null;

    return NextResponse.json({
      paymentMethodMask: workspace?.paymentMethodMask || null,
      providerCustomerId: workspace?.billingProviderId || null,
      provider,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch payment method." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { paymentMethodMask: true, billingProviderId: true },
    });

    if (!workspace?.billingProviderId) {
      return NextResponse.json(
        { error: "Billing provider account not connected for this workspace." },
        { status: 400 },
      );
    }

    if (workspace.paymentMethodMask) {
      return NextResponse.json({ ok: true, message: "Payment method already on file." });
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        paymentMethodMask: "•••• 4242",
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to add payment method." }, { status: 500 });
  }
}

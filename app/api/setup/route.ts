import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId;
  const userId = (session as any)?.user?.id;

  if (!workspaceId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    // 1. Update Workspace Globalization Settings
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        countryCode: body.countryCode,
        baseCurrency: body.baseCurrency,
        isSetupComplete: true
      }
    });

    // 1.5 Update User Personal Profile
    await prisma.user.update({
      where: { id: userId },
      data: {
        locale: body.locale || "en-IN",
        currencyFormat: body.baseCurrency || "INR",
      }
    });

    // 2. Upsert Business Profile with dynamic labels
    await prisma.businessProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        companyName: body.companyName,
        proprietorName: body.proprietorName,
        email: body.email,
        address: body.address,
        taxLabel: body.taxLabel,
        taxIdLabel: body.taxIdLabel,
        routingLabel: body.routingLabel,
        // Fallback for banking (can be finished in settings later)
        bankName: "Pending Setup",
        accountName: body.proprietorName,
        accountNumber: "0000",
        ifscCode: "0000",
        panNumber: "PENDING"
      },
      update: {
        companyName: body.companyName,
        proprietorName: body.proprietorName,
        email: body.email,
        address: body.address,
        taxLabel: body.taxLabel,
        taxIdLabel: body.taxIdLabel,
        routingLabel: body.routingLabel,
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Setup Error:", err);
    return NextResponse.json({ error: "Could not finalize setup" }, { status: 500 });
  }
}
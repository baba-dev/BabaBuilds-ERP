import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SetupPayload = {
  countryCode?: string;
  baseCurrency?: string;
  locale?: string;
  taxLabel?: string;
  taxIdLabel?: string;
  routingLabel?: string;
  companyName?: string;
  proprietorName?: string;
  email?: string;
  address?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as any)?.workspaceId;
  const userId = (session as any)?.user?.id;

  if (!workspaceId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as SetupPayload;
    const fieldErrors: Record<string, string> = {};

    if (!body.countryCode?.trim()) fieldErrors.countryCode = "Country is required.";
    if (!body.baseCurrency?.trim()) fieldErrors.baseCurrency = "Base currency is required.";
    if (!body.locale?.trim()) fieldErrors.locale = "Locale is required.";

    if (!body.companyName?.trim()) fieldErrors.companyName = "Company name is required.";
    if (!body.proprietorName?.trim()) fieldErrors.proprietorName = "Founder/Proprietor name is required.";
    if (!body.email?.trim()) fieldErrors.email = "Email is required.";
    if (body.email?.trim() && !isValidEmail(body.email.trim())) {
      fieldErrors.email = "Please enter a valid email address.";
    }
    if (!body.address?.trim()) fieldErrors.address = "Billing address is required.";

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          fieldErrors,
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          countryCode: body.countryCode!.trim(),
          baseCurrency: body.baseCurrency!.trim(),
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          locale: body.locale!.trim(),
          currencyFormat: body.baseCurrency!.trim(),
        },
      });

      await tx.businessProfile.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          companyName: body.companyName!.trim(),
          proprietorName: body.proprietorName!.trim(),
          email: body.email!.trim(),
          address: body.address!.trim(),
          taxLabel: body.taxLabel,
          taxIdLabel: body.taxIdLabel,
          routingLabel: body.routingLabel,
          // Fallback for banking (can be finished in settings later)
          bankName: "Pending Setup",
          accountName: body.proprietorName!.trim(),
          accountNumber: "0000",
          ifscCode: "0000",
          panNumber: "PENDING",
        },
        update: {
          companyName: body.companyName!.trim(),
          proprietorName: body.proprietorName!.trim(),
          email: body.email!.trim(),
          address: body.address!.trim(),
          taxLabel: body.taxLabel,
          taxIdLabel: body.taxIdLabel,
          routingLabel: body.routingLabel,
        },
      });

      await tx.workspace.update({
        where: { id: workspaceId },
        data: { isSetupComplete: true },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Setup Error:", err);
    return NextResponse.json({ error: "Could not finalize setup" }, { status: 500 });
  }
}

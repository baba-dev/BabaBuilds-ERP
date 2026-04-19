import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enableModule } from "@/lib/modules";

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
  
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFromEmail?: string;
  
  groqApiKey?: string;
  
  defaultGateway?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  stripePublishableKey?: string;
  stripeSecretKey?: string;
  
  shopEnabled?: boolean;
  shopSlug?: string;
  shopTagline?: string;
  shopAccentColor?: string;
  enableWorkforce?: boolean;
  enableDocuments?: boolean;
  enableRevenuePipeline?: boolean;
  enablePayroll?: boolean;
  enableCashFlow?: boolean;
  enableArCollections?: boolean;
  enableReportingCenter?: boolean;
  payrollSetupPath?: "STANDALONE" | "WORKFORCE_LINKED";
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const typedSession = session as { workspaceId?: string; user?: { id?: string } } | null;
  const workspaceId = typedSession?.workspaceId;
  const userId = typedSession?.user?.id;

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

          smtpHost: body.smtpHost,
          smtpPort: body.smtpPort,
          smtpUser: body.smtpUser,
          smtpPassword: body.smtpPassword,
          smtpFromEmail: body.smtpFromEmail,
          groqApiKey: body.groqApiKey,
          defaultGateway: body.defaultGateway,
          razorpayKeyId: body.razorpayKeyId,
          razorpayKeySecret: body.razorpayKeySecret,
          stripePublishableKey: body.stripePublishableKey,
          stripeSecretKey: body.stripeSecretKey,
          shopEnabled: body.shopEnabled ?? false,
          shopSlug: body.shopSlug,
          shopTagline: body.shopTagline,
          shopAccentColor: body.shopAccentColor,
        },
        update: {
          companyName: body.companyName!.trim(),
          proprietorName: body.proprietorName!.trim(),
          email: body.email!.trim(),
          address: body.address!.trim(),
          taxLabel: body.taxLabel,
          taxIdLabel: body.taxIdLabel,
          routingLabel: body.routingLabel,

          smtpHost: body.smtpHost,
          smtpPort: body.smtpPort,
          smtpUser: body.smtpUser,
          smtpPassword: body.smtpPassword,
          smtpFromEmail: body.smtpFromEmail,
          groqApiKey: body.groqApiKey,
          defaultGateway: body.defaultGateway,
          razorpayKeyId: body.razorpayKeyId,
          razorpayKeySecret: body.razorpayKeySecret,
          stripePublishableKey: body.stripePublishableKey,
          stripeSecretKey: body.stripeSecretKey,
          shopEnabled: body.shopEnabled ?? false,
          shopSlug: body.shopSlug,
          shopTagline: body.shopTagline,
          shopAccentColor: body.shopAccentColor,
        },
      });

      await tx.workspace.update({
        where: { id: workspaceId },
        data: { isSetupComplete: true },
      });
    });

    // Post-transaction: enable optional modules (non-blocking)
    if (body.enableWorkforce === true) {
      await enableModule(workspaceId, 'WORKFORCE', userId).catch((e) =>
        console.error('[setup] Workforce module init failed (non-blocking):', e)
      );
    }

    if (body.enableDocuments === true) {
      await enableModule(workspaceId, 'DOCUMENTS', userId).catch((e) =>
        console.error('[setup] Documents module init failed (non-blocking):', e)
      );
    }

    if (body.enableRevenuePipeline === true) {
      await enableModule(workspaceId, 'REVENUE_PIPELINE', userId).catch((e) =>
        console.error('[setup] Revenue Pipeline module init failed (non-blocking):', e)
      );
    }

    if (body.enablePayroll === true) {
      await enableModule(workspaceId, 'PAYROLL', userId, {
        onboardingPath: body.payrollSetupPath ?? 'STANDALONE',
        executionPhase: 'PHASE_1',
        previewMode: true,
        postingEnabled: false,
        exportsEnabled: false,
        createdFrom: 'setup_wizard',
      }).catch((e) =>
        console.error('[setup] Payroll module init failed (non-blocking):', e)
      );
    }


    if (body.enableCashFlow === true) {
      await enableModule(workspaceId, 'CASH_FLOW', userId).catch((e) =>
        console.error('[setup] Cash Flow module init failed (non-blocking):', e)
      );
    }

    if (body.enableArCollections === true) {
      await enableModule(workspaceId, 'AR_COLLECTIONS', userId).catch((e) =>
        console.error('[setup] AR Collections module init failed (non-blocking):', e)
      );
    }
    if (body.enableReportingCenter === true) {
      await enableModule(workspaceId, 'REPORTING_CENTER', userId).catch((e) =>
        console.error('[setup] Reporting Center module init failed (non-blocking):', e)
      );
    }

    if (body.enableReportingCenter === true) {
      await enableModule(workspaceId, 'REPORTING_CENTER', userId).catch((e) =>
        console.error('[setup] Reporting Center module init failed (non-blocking):', e)
      );
    }

    return NextResponse.json({ success: true, workspaceId });
  } catch (err) {
    console.error("Setup Error:", err);
    return NextResponse.json({ error: "Could not finalize setup" }, { status: 500 });
  }
}

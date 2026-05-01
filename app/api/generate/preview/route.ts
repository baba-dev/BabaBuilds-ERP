import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { Prisma } from "@prisma/client";
import {
  buildInvoiceGenerationContext,
  InvoiceValidationError,
  type InvoiceGenerationInput,
} from "@/lib/invoice/generation-context";
import { generateTenantPaymentLink } from "@/lib/razorpay-links";
import { decrypt } from "@/lib/encryption";

const DRAFT_TTL_MS = 30 * 60 * 1000;

type SessionWithWorkspace = {
  workspaceId?: string;
  user?: {
    id?: string | null;
  };
};

type ConfirmationResponse = {
  success: true;
  draftId: string;
  expiresAt: Date;
  confirmation: {
    draftId: string;
    clientName: string;
    clientEmail: string | null;
    billingMonth: string;
    invoiceDate: Date;
    dueDate: Date;
    currency: string;
    services: Array<{ title: string; amount: number; quantity: number }>;
    totals: {
      subtotal: number;
      taxAmount: number;
      total: number;
      taxRate: number;
      taxMode: string;
    };
    paymentLink: {
      url: string;
      linkId: string;
    };
  };
};

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const actorId = session.user?.id ?? "unknown-user";
    const body = (await request.json()) as InvoiceGenerationInput;
    const context = await buildInvoiceGenerationContext(workspaceId, body);
    const defaultGateway = context.profileSettings.defaultGateway || "RAZORPAY";

    if (defaultGateway !== "RAZORPAY") {
      return NextResponse.json(
        {
          error: "Razorpay preview is not applicable for the current default gateway.",
          code: "RAZORPAY_PREVIEW_NOT_APPLICABLE",
          gateway: defaultGateway,
        },
        { status: 400 },
      );
    }

    await prisma.invoiceGenerationDraft.updateMany({
      where: { workspaceId, status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });

    if (context.baseCurrency !== "INR") {
      return NextResponse.json(
        { error: `Razorpay preview requires INR currency. Workspace currency is ${context.baseCurrency}.`, code: "UNSUPPORTED_CURRENCY" },
        { status: 400 },
      );
    }
    if (!context.profileSettings.razorpayKeyId || !context.profileSettings.razorpayKeySecret) {
      return NextResponse.json(
        { error: "Razorpay credentials are missing in workspace settings.", code: "MISSING_GATEWAY_CREDENTIALS" },
        { status: 400 },
      );
    }

    let decryptedSecret = context.profileSettings.razorpayKeySecret as string;
    try {
      decryptedSecret = decrypt(context.profileSettings.razorpayKeySecret);
    } catch {
      console.warn("[generate/preview] Using legacy plaintext Razorpay secret fallback.");
    }

    const paymentLinkResult = await generateTenantPaymentLink({
      amount: toDecimal(context.totals.total).toNumber(),
      currency: context.baseCurrency,
      description: `Invoice preview for ${context.client.name}`,
      invoiceDueDate: context.dueDate,
      customerDetails: {
        name: context.client.name,
        email: context.client.email ?? undefined,
      },
      tenantKeyId: context.profileSettings.razorpayKeyId,
      tenantKeySecret: decryptedSecret,
    });

    if (!paymentLinkResult?.url || !paymentLinkResult.linkId) {
      return NextResponse.json(
        { error: "Could not generate Razorpay payment URL for confirmation.", code: "GATEWAY_CALL_FAILED" },
        { status: 502 },
      );
    }

    const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);
    const draft = await prisma.invoiceGenerationDraft.create({
      data: {
        workspaceId,
        createdByUserId: actorId,
        payloadJson: body as unknown as Prisma.InputJsonValue,
        totalsJson: {
          subtotal: context.totals.subtotal,
          taxAmount: context.totals.taxAmount,
          total: context.totals.total,
          taxRate: context.totals.taxRate,
          taxMode: context.totals.taxMode,
        } as Prisma.InputJsonValue,
        currency: context.baseCurrency,
        status: "PENDING",
        razorpayLinkId: paymentLinkResult.linkId,
        razorpayLinkUrl: paymentLinkResult.url,
        expiresAt,
      },
    });

    const responsePayload: ConfirmationResponse = {
      success: true,
      draftId: draft.id,
      expiresAt: draft.expiresAt,
      confirmation: {
        draftId: draft.id,
        clientName: context.client.name,
        clientEmail: context.client.email,
        billingMonth: context.billingMonthValue,
        invoiceDate: context.invoiceDate,
        dueDate: context.dueDate,
        currency: context.baseCurrency,
        services: context.sanitizedServices.map((s) => ({
          title: s.title,
          amount: s.amount,
          quantity: s.quantity || 1,
        })),
        totals: {
          subtotal: context.totals.subtotal,
          taxAmount: context.totals.taxAmount,
          total: context.totals.total,
          taxRate: context.totals.taxRate,
          taxMode: context.totals.taxMode,
        },
        paymentLink: {
          url: paymentLinkResult.url,
          linkId: paymentLinkResult.linkId,
        },
      },
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof InvoiceValidationError) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    console.error("Generate preview error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice preview" },
      { status: 400 },
    );
  }
}

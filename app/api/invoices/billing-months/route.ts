import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as any)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") || 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(2000, Math.max(1, Math.floor(limitRaw))) : 500;

    const invoices = await prisma.invoice.findMany({
      where: { workspaceId },
      select: { billingMonth: true, clientId: true },
      orderBy: { invoiceDate: "desc" },
      take: limit,
    });

    return NextResponse.json({
      data: invoices
        .filter((inv) => typeof inv.billingMonth === "string" && inv.billingMonth.length > 0)
        .map((inv) => ({ billingMonth: inv.billingMonth, clientId: inv.clientId ? String(inv.clientId) : null })),
    });
  } catch (error) {
    console.error("Invoice billing months API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice billing months", code: "INVOICE_BILLING_MONTHS_FAILED" },
      { status: 500 },
    );
  }
}


import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & {
      workspaceId?: string;
      locale?: string;
    }) | null;

    if (!scopedSession?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;
    const locale = scopedSession.locale || "en-IN";

    const [workspace, invoices] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { billingProviderId: true, planInterval: true },
      }),
      prisma.invoice.findMany({
        where: { workspaceId, status: "PAID" },
        orderBy: { invoiceDate: "desc" },
        take: 20,
        select: {
          id: true,
          invoiceDate: true,
          totalAmount: true,
          status: true,
          invoiceNumber: true,
        },
      }),
    ]);

    const items = invoices.map((invoice) => ({
      id: invoice.id,
      date: invoice.invoiceDate.toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }),
      amount: Number(invoice.totalAmount),
      status: invoice.status,
      description: `Invoice ${invoice.invoiceNumber}${workspace?.planInterval ? ` (${workspace.planInterval})` : ""}`,
      providerReference: workspace?.billingProviderId || null,
    }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Failed to load billing invoices." }, { status: 500 });
  }
}

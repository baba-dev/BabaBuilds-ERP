import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Legacy route path: `/api/settings/billing/invoices`.
// This endpoint intentionally returns subscription billing transactions only.
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

    const transactions = await prisma.billingTransaction.findMany({
      where: { workspaceId },
      orderBy: { transactionDate: "desc" },
      take: 20,
      select: {
        id: true,
        transactionDate: true,
        amount: true,
        status: true,
        description: true,
        providerReference: true,
      },
    });

    const items = transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.transactionDate.toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }),
      amount: Number(transaction.amount),
      status: transaction.status,
      description: transaction.description,
      providerReference: transaction.providerReference ?? null,
    }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Failed to load billing transactions." }, { status: 500 });
  }
}

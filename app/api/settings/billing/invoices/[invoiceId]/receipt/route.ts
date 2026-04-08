import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Legacy route path: `/api/settings/billing/invoices/[invoiceId]/receipt`.
// The `invoiceId` param now represents a billing transaction id.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { invoiceId } = await params;
    const workspaceId = scopedSession.workspaceId;

    const transaction = await prisma.billingTransaction.findFirst({
      where: { id: invoiceId, workspaceId },
      select: { receiptUrl: true },
    });

    if (!transaction?.receiptUrl) {
      return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    }

    return NextResponse.json({ downloadUrl: transaction.receiptUrl });
  } catch {
    return NextResponse.json({ error: "Failed to fetch billing receipt." }, { status: 500 });
  }
}

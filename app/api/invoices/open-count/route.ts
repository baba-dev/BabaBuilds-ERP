import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string | null } | null)?.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }

    const openInvoiceCount = await prisma.invoice.count({
      where: {
        workspaceId,
        status: { notIn: [INVOICE_STATUS.PAID, INVOICE_STATUS.VOID] },
      },
    });

    return NextResponse.json({ openInvoiceCount });
  } catch (error) {
    console.error("Open Invoice Count API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch open invoice count", code: "INVOICE_OPEN_COUNT_FAILED" },
      { status: 500 },
    );
  }
}

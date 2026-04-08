import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId },
      select: { pdfPath: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const normalizedPath = invoice.pdfPath.replace(/^[/\\]+/, "");
    const downloadUrl = normalizedPath.startsWith("invoices/")
      ? `/${normalizedPath}`
      : `/invoices/${normalizedPath}`;

    return NextResponse.json({ downloadUrl });
  } catch {
    return NextResponse.json({ error: "Failed to fetch invoice receipt." }, { status: 500 });
  }
}

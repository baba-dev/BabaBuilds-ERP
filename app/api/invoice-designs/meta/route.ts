import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVOICE_DESIGN_CATALOG } from "@/lib/invoice-templates/catalog";

export const dynamic = "force-dynamic";

/** What the compare page needs: the designs, the invoice being previewed, and the workspace's current choices. */
export async function GET() {
  const session = (await getServerSession(authOptions)) as { workspaceId?: string } | null;
  const workspaceId = session?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [latest, settings] = await Promise.all([
    prisma.invoice.findFirst({
      where: { workspaceId, status: { not: "VOID" } },
      orderBy: { invoiceDate: "desc" },
      select: { id: true, invoiceNumber: true, clientName: true, invoiceDate: true },
    }),
    prisma.businessProfile.findUnique({ where: { workspaceId }, select: { invoiceTheme: true, invoiceAccentColor: true } }),
  ]);

  return NextResponse.json({
    designs: INVOICE_DESIGN_CATALOG,
    invoice: latest ? { id: latest.id, number: latest.invoiceNumber, clientName: latest.clientName, date: latest.invoiceDate } : null,
    selectedDesign: settings?.invoiceTheme ?? null,
    workspaceAccent: settings?.invoiceAccentColor ?? null,
  });
}

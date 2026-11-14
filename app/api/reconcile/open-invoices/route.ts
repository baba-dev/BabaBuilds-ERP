import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireReconAccess } from "@/lib/reconciliation/access";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const access = await requireReconAccess("reconciliation.import");
  if (!access.ok) return access.response;
  const workspaceId = access.ctx.workspaceId;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const take = Math.min(25, Math.max(1, Number(searchParams.get("limit") || 15)));

  const where: Prisma.InvoiceWhereInput = {
    workspaceId,
    status: { in: ["PENDING", "PARTIALLY_PAID"] },
    ...(q.length >= 1
      ? {
          OR: [
            { invoiceNumber: { contains: q } },
            { clientName: { contains: q } },
          ],
        }
      : {}),
  };

  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { invoiceDate: "desc" },
    take,
    select: {
      id: true,
      invoiceNumber: true,
      clientName: true,
      grandTotal: true,
      totalAmount: true,
      amountReceived: true,
      status: true,
    },
  });

  const data = rows.map((inv) => {
    const billed = Number(inv.grandTotal ?? inv.totalAmount ?? 0);
    const received = Number(inv.amountReceived ?? 0);
    const outstanding = Math.max(0, billed - received);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      outstanding,
      status: inv.status,
    };
  });

  return NextResponse.json({ data });
}

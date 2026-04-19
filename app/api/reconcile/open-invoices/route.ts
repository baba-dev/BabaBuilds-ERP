import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string })?.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

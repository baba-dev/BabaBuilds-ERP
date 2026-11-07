import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS } from '@/lib/invoice-status';
import { serializeMoney, toDecimal } from '@/lib/money';
import { withPermission } from '@/lib/rbac';

const isPaidStatus = (status: unknown) => String(status).toUpperCase() === "PAID";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const userId = session.user?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // RBAC: viewing invoices requires invoices.view permission
    const perm = await withPermission(userId, workspaceId, 'invoices.view');
    if (!perm.granted) return perm.response;

    const whereClause = { workspaceId };

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '15');
    const skip = (page - 1) * limit;

    const [invoices, totalInvoices, invoiceAggregates] = await Promise.all([
      prisma.invoice.findMany({ where: whereClause, orderBy: { invoiceDate: 'desc' }, skip, take: limit }),
      prisma.invoice.count({ where: whereClause }),
      prisma.invoice.groupBy({
        where: whereClause,
        by: ["status"],
        _sum: { grandTotal: true, totalAmount: true, amountReceived: true },
      }),
    ]);

    const totalRevenueDecimal = invoiceAggregates.reduce((sum, row) => {
      const billed = toDecimal(row._sum.grandTotal ?? row._sum.totalAmount ?? 0);
      return sum.plus(billed);
    }, new Prisma.Decimal(0));

    const realizedRevenueDecimal = invoiceAggregates.reduce((sum, row) => {
      if (!isPaidStatus(row.status)) return sum;
      const realized = toDecimal(row._sum.amountReceived ?? row._sum.grandTotal ?? row._sum.totalAmount ?? 0);
      return sum.plus(realized);
    }, new Prisma.Decimal(0));

    const outstandingDecimal = invoiceAggregates.reduce((sum, row) => {
      if (isPaidStatus(row.status)) return sum;
      const billed = toDecimal(row._sum.grandTotal ?? row._sum.totalAmount ?? 0);
      const received = toDecimal(row._sum.amountReceived ?? 0);
      return sum.plus(Prisma.Decimal.max(new Prisma.Decimal(0), billed.minus(received)));
    }, new Prisma.Decimal(0));

    const presumptiveIncomeDecimal = realizedRevenueDecimal.mul(0.5);

    return NextResponse.json({
      data: invoices.map((invoice) => ({
        ...invoice,
        status: invoice.status || INVOICE_STATUS.PENDING,
      })),
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalInvoices / limit),
        totalRecords: totalInvoices,
        kpis: {
          totalRevenue: serializeMoney(totalRevenueDecimal),
          outstanding: serializeMoney(outstandingDecimal),
          presumptiveIncome: serializeMoney(presumptiveIncomeDecimal),
        },
      },
    });

  } catch (error) {
    console.error("API Error fetching invoices:", error);
    return NextResponse.json({ error: 'Failed to fetch invoices', code: 'INVOICES_FETCH_FAILED' }, { status: 500 });
  }
}

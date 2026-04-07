import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS, isOpenInvoiceStatus, isPaidInvoiceStatus } from '@/lib/invoice-status';
import { toDecimal } from '@/lib/money';

const isPaidStatus = (status: unknown) => String(status).toUpperCase() === "PAID";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const whereClause = { workspaceId };

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '15');
    const skip = (page - 1) * limit;

    const [invoices, totalInvoices, allInvoicesForKpis] = await Promise.all([
      prisma.invoice.findMany({ where: whereClause, orderBy: { invoiceDate: 'desc' }, skip, take: limit }),
      prisma.invoice.count({ where: whereClause }),
      prisma.invoice.findMany({
        where: whereClause,
        select: { totalAmount: true, grandTotal: true, status: true, amountReceived: true },
      }),
    ]);

    const totalRevenueDecimal = allInvoicesForKpis.reduce((sum, inv) => {
      const billed = inv.grandTotal ?? inv.totalAmount;
      return sum.plus(toDecimal(billed));
    }, new Prisma.Decimal(0));

    const outstandingDecimal = allInvoicesForKpis
      .filter(inv => !isPaidStatus(inv.status))
      .reduce((sum, inv) => {
        const billed = toDecimal(inv.grandTotal ?? inv.totalAmount);
        const received = toDecimal(inv.amountReceived);
        return sum.plus(billed.minus(received));
      }, new Prisma.Decimal(0));

    const realizedRevenueDecimal = allInvoicesForKpis
      .filter(inv => isPaidStatus(inv.status))
      .reduce((sum, inv) => {
        const realized = inv.amountReceived ?? inv.grandTotal ?? inv.totalAmount;
        return sum.plus(toDecimal(realized));
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
          totalRevenue: totalRevenueDecimal.toNumber(),
          outstanding: outstandingDecimal.toNumber(),
          presumptiveIncome: presumptiveIncomeDecimal.toNumber(),
        },
      },
    });

  } catch (error) {
    console.error("API Error fetching invoices:", error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

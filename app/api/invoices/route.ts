import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS, isOpenInvoiceStatus, isPaidInvoiceStatus } from '@/lib/invoice-status';

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
    
    // 4. SERVER-SIDE KPI CALCULATION
    const totalRevenue = allInvoicesForKpis.reduce((sum, inv) => sum + ((inv as any).grandTotal || inv.totalAmount), 0);
    const outstanding = allInvoicesForKpis
      .filter(inv => isOpenInvoiceStatus(inv.status))
      .reduce((sum, inv) => sum + ((((inv as any).grandTotal || inv.totalAmount)) - (inv.amountReceived || 0)), 0);
    const realizedRevenue = allInvoicesForKpis
      .filter(inv => isPaidInvoiceStatus(inv.status))
      .reduce((sum, inv) => sum + (inv.amountReceived || (inv as any).grandTotal || inv.totalAmount), 0);
    const presumptiveIncome = realizedRevenue * 0.5;

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

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK & WORKSPACE ID
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const whereClause = { workspaceId: workspaceId };

    // 2. PAGINATION PARAMETERS
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '15');
    const skip = (page - 1) * limit;

    // 3. CONCURRENT DATABASE QUERIES
    const [invoices, totalInvoices, allInvoicesForKpis] = await Promise.all([
      // A. Get the paginated data for the current page
      prisma.invoice.findMany({
        where: whereClause,
        orderBy: { invoiceDate: 'desc' },
        skip: skip,
        take: limit,
      }),
      // B. Get the total count of invoices for calculating total pages
      prisma.invoice.count({ where: whereClause }),
      // C. Get all invoices (no pagination) just for calculating accurate KPIs
      prisma.invoice.findMany({
        where: whereClause,
        select: {
          totalAmount: true,
          status: true,
          amountReceived: true,
        },
      }),
    ]);
    
    // 4. SERVER-SIDE KPI CALCULATION
    const totalRevenue = allInvoicesForKpis.reduce((sum, inv) => sum + ((inv as any).grandTotal || inv.totalAmount), 0);
    const outstanding = allInvoicesForKpis
      .filter(inv => inv.status !== 'Paid' && inv.status !== 'PAID')
      .reduce((sum, inv) => sum + ((((inv as any).grandTotal || inv.totalAmount)) - (inv.amountReceived || 0)), 0);
    const realizedRevenue = allInvoicesForKpis
      .filter(inv => inv.status === 'Paid' || inv.status === 'PAID')
      .reduce((sum, inv) => sum + (inv.amountReceived || (inv as any).grandTotal || inv.totalAmount), 0);
    const presumptiveIncome = realizedRevenue * 0.5;

    // 5. CONSTRUCT PAGINATED RESPONSE
    return NextResponse.json({
      data: invoices,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalInvoices / limit),
        totalRecords: totalInvoices,
        kpis: {
          totalRevenue,
          outstanding,
          presumptiveIncome,
        },
      },
    });

  } catch (error) {
    console.error("API Error fetching invoices:", error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

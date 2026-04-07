import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { decimalToNumber, toDecimal } from '@/lib/money';

const normalizeInvoiceStatus = (status: unknown) =>
  String(status)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const { searchParams } = new URL(request.url);
    let fy = searchParams.get('fy');

    if (!fy) {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const shortYear = currentYear.toString().slice(-2);
      fy = currentMonth <= 3 ? `${parseInt(shortYear) - 1}-${shortYear}` : `${shortYear}-${parseInt(shortYear) + 1}`;
    }

    const [invoices, investments, activeClientCount, retainers, recentInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where: { financialYear: fy, workspaceId },
        include: { client: true },
        orderBy: { invoiceDate: 'asc' }
      }),
      prisma.investment.findMany({ where: { workspaceId } }),
      prisma.client.count({ where: { workspaceId } }),
      prisma.retainer.findMany({ where: { workspaceId, status: "ACTIVE" }, include: { client: true } }),
      prisma.invoice.findMany({ where: { workspaceId }, orderBy: { invoiceDate: 'desc' }, take: 5, include: { client: true } })
    ]);

    const totalRevenueDecimal = invoices.reduce(
      (sum, inv) => sum.plus(toDecimal(inv.totalAmount)),
      new Prisma.Decimal(0)
    );
    const totalWealthDecimal = investments.reduce(
      (sum, inv) => sum.plus(toDecimal(inv.amount)),
      new Prisma.Decimal(0)
    );

    const presumptiveIncomeDecimal = totalRevenueDecimal.mul(0.5);
    const eligible80CDecimal = investments
      .filter(i => i.category.includes('80C'))
      .reduce((sum, i) => sum.plus(toDecimal(i.amount)), new Prisma.Decimal(0));
    const eligible80C = decimalToNumber(Prisma.Decimal.min(eligible80CDecimal, new Prisma.Decimal(150000)));
    const taxableIncome = Math.max(0, decimalToNumber(presumptiveIncomeDecimal.minus(eligible80C)));

    let estimatedTax = 0;
    if (taxableIncome > 700000) {
      if (taxableIncome > 300000) estimatedTax += Math.min(taxableIncome - 300000, 300000) * 0.05;
      if (taxableIncome > 600000) estimatedTax += Math.min(taxableIncome - 600000, 300000) * 0.10;
      if (taxableIncome > 900000) estimatedTax += Math.min(taxableIncome - 900000, 300000) * 0.15;
      if (taxableIncome > 1200000) estimatedTax += Math.min(taxableIncome - 1200000, 300000) * 0.20;
      if (taxableIncome > 1500000) estimatedTax += (taxableIncome - 1500000) * 0.30;
    }

    let mrrTotal = 0;
    const clientIds = retainers.map(ret => ret.clientId);

    const allRelevantInvoices = await prisma.invoice.findMany({
      where: { clientId: { in: clientIds }, workspaceId },
      orderBy: { invoiceDate: 'desc' },
    });

    const invoicesByClient = allRelevantInvoices.reduce((acc: any, inv: any) => {
      if (!acc[inv.clientId]) acc[inv.clientId] = [];
      acc[inv.clientId].push(inv);
      return acc;
    }, {});

    const retainerRadar = retainers.map((ret) => {
      mrrTotal += decimalToNumber(ret.amount);
      const recentClientInvoices = (invoicesByClient[ret.clientId as string] || []).slice(0, 3);

      let health = "good";
      const today = new Date();

      if (recentClientInvoices.length === 0) {
        health = "pending";
      } else {
        for (const inv of recentClientInvoices) {
          const normalizedStatus = normalizeInvoiceStatus(inv.status);
          if (normalizedStatus === 'PENDING' || normalizedStatus === 'PARTIALLY_PAID') {
            const daysOverdue = Math.floor((today.getTime() - new Date(inv.invoiceDate).getTime()) / (1000 * 3600 * 24));
            if (daysOverdue > 15) {
              health = "danger";
              break;
            } else if (daysOverdue > 7) {
              health = "warning";
            }
          } else if (normalizedStatus === 'PAID') {
            if (inv.dateReceived) {
              const daysToPay = Math.floor((new Date(inv.dateReceived).getTime() - new Date(inv.invoiceDate).getTime()) / (1000 * 3600 * 24));
              if (daysToPay > 10 && health !== "danger") {
                health = "warning";
              }
            }
          }
        }
      }

      return {
        clientName: ret.client.name,
        serviceName: ret.serviceName,
        amount: decimalToNumber(ret.amount),
        health
      };
    });

    const healthWeight: Record<string, number> = { "danger": 3, "warning": 2, "good": 1 };
    retainerRadar.sort((a, b) => healthWeight[b.health] - healthWeight[a.health]);

    const monthlyRevenue: Record<string, number> = {};
    invoices.forEach(inv => {
      const billingMonth = inv.billingMonth ? String(inv.billingMonth).trim() : '';
      const billingMonthToken = billingMonth ? billingMonth.split(' ')[0] : '';
      const invoiceDate = inv.invoiceDate ? new Date(inv.invoiceDate) : null;
      const invoiceDateMonth = invoiceDate && !Number.isNaN(invoiceDate.getTime())
        ? invoiceDate.toLocaleString('en-US', { month: 'long' })
        : '';

      const month = billingMonthToken || invoiceDateMonth || 'Unknown';
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + decimalToNumber(inv.totalAmount);
    });
    const revenueChartData = Object.keys(monthlyRevenue).map(month => ({
      name: month.substring(0, 3),
      revenue: monthlyRevenue[month]
    }));

    const wealthDistribution: Record<string, number> = {};
    investments.forEach(inv => {
      const cat = inv.category.split(' ')[0];
      wealthDistribution[cat] = (wealthDistribution[cat] || 0) + decimalToNumber(inv.amount);
    });

    const wealthChartData = Object.keys(wealthDistribution).map((key, index) => ({
      name: key,
      value: wealthDistribution[key],
      color: ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'][index % 5]
    }));

    return NextResponse.json({
      kpis: {
        totalRevenue: decimalToNumber(totalRevenueDecimal),
        totalWealth: decimalToNumber(totalWealthDecimal),
        estimatedTax,
        activeClients: activeClientCount
      },
      mrr: {
        total: mrrTotal,
        retainers: retainerRadar
      },
      charts: {
        revenue: revenueChartData,
        wealth: wealthChartData
      },
      recentInvoices
    });

  } catch (error) {
    console.error("Dashboard Data Error:", error);
    return NextResponse.json({ error: 'Failed to aggregate dashboard data' }, { status: 500 });
  }
}

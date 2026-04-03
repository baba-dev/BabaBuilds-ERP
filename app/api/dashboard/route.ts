import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK & MULTI-TENANT ISOLATION
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. FINANCIAL YEAR MATH (April - March)
    const { searchParams } = new URL(request.url);
    let fy = searchParams.get('fy');
    
    if (!fy) {
      const today = new Date();
      const currentMonth = today.getMonth() + 1; 
      const currentYear = today.getFullYear();
      const shortYear = currentYear.toString().slice(-2);
      fy = currentMonth <= 3 ? `${parseInt(shortYear) - 1}-${shortYear}` : `${shortYear}-${parseInt(shortYear) + 1}`;
    }

    // 3. CONCURRENT DATA FETCHING (Massive speed boost vs sequential fetching)
    const [invoices, investments, activeClientCount, retainers, recentInvoices] = await Promise.all([
      prisma.invoice.findMany({ 
        where: { financialYear: fy, workspaceId },
        include: { client: true },
        orderBy: { invoiceDate: 'asc' } 
      }),
      prisma.investment.findMany({
        where: { workspaceId } 
      }),
      prisma.client.count({
        where: { workspaceId } 
      }),
      prisma.retainer.findMany({
        where: { workspaceId, status: "ACTIVE" },
        include: { client: true }
      }),
      // Fetch the last 5 invoices GLOBALLY for the ledger table
      prisma.invoice.findMany({
        where: { workspaceId },
        orderBy: { invoiceDate: 'desc' },
        take: 5,
        include: { client: true }
      })
    ]);

    // 4. CORE KPIs & TAX ESTIMATION (44ADA - New Regime Logic)
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalWealth = investments.reduce((sum, inv) => sum + inv.amount, 0);
    
    // 44ADA Presumptive Income (50%)
    const presumptiveIncome = totalRevenue * 0.5;
    const eligible80C = Math.min(investments.filter(i => i.category.includes('80C')).reduce((sum, i) => sum + i.amount, 0), 150000);
    const taxableIncome = Math.max(0, presumptiveIncome - eligible80C);
    
    // Tax Slab Calculation
    let estimatedTax = 0;
    if (taxableIncome > 700000) { 
      if (taxableIncome > 300000) estimatedTax += Math.min(taxableIncome - 300000, 300000) * 0.05;
      if (taxableIncome > 600000) estimatedTax += Math.min(taxableIncome - 600000, 300000) * 0.10;
      if (taxableIncome > 900000) estimatedTax += Math.min(taxableIncome - 900000, 300000) * 0.15;
      if (taxableIncome > 1200000) estimatedTax += Math.min(taxableIncome - 1200000, 300000) * 0.20;
      if (taxableIncome > 1500000) estimatedTax += (taxableIncome - 1500000) * 0.30;
    }

    // 5. MRR & AI HEALTH RADAR CALCULATION
    let mrrTotal = 0;

    // --- N+1 FIX START: Fetch all invoices in ONE query ---
    const clientIds = retainers.map(ret => ret.clientId);
    
    const allRelevantInvoices = await prisma.invoice.findMany({
      where: { 
        clientId: { in: clientIds }, 
        workspaceId 
      },
      orderBy: { invoiceDate: 'desc' },
    });

    // Group invoices by clientId in memory
    const invoicesByClient = allRelevantInvoices.reduce((acc: any, inv: any) => {
      if (!acc[inv.clientId]) acc[inv.clientId] = [];
      acc[inv.clientId].push(inv);
      return acc;
    }, {});

    const retainerRadar = retainers.map((ret) => {
      mrrTotal += ret.amount;

      // Get this specific client's invoices from the in-memory map (limit to top 3)
      const recentClientInvoices = (invoicesByClient[ret.clientId as string] || []).slice(0, 3);

      let health = "good"; 
      const today = new Date();
      
      if (recentClientInvoices.length === 0) {
        health = "pending"; // It's brand new, we don't have payment data yet
      } else {
        for (const inv of recentClientInvoices) {
          if (inv.status === 'Pending' || inv.status === 'PARTIALLY_PAID' || inv.status === 'Partially Paid') {
            const daysOverdue = Math.floor((today.getTime() - new Date(inv.invoiceDate).getTime()) / (1000 * 3600 * 24));
            if (daysOverdue > 15) {
              health = "danger";
              break; 
            } else if (daysOverdue > 7) {
              health = "warning";
            }
          } else if (inv.status === 'Paid' || inv.status === 'PAID') {
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
        amount: ret.amount,
        health: health 
      };
    });
    // --- N+1 FIX END ---

    // Sort radar so critical (danger/warning) items float to the top
    const healthWeight: Record<string, number> = { "danger": 3, "warning": 2, "good": 1 };
    retainerRadar.sort((a, b) => healthWeight[b.health] - healthWeight[a.health]);

    // 6. CHART DATA (Revenue Trend)
    const monthlyRevenue: Record<string, number> = {};
    invoices.forEach(inv => {
      const month = inv.billingMonth.split(' ')[0]; // e.g., "March"
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + inv.totalAmount;
    });
    const revenueChartData = Object.keys(monthlyRevenue).map(month => ({
      name: month.substring(0, 3), 
      revenue: monthlyRevenue[month]
    }));

    // 7. CHART DATA (Wealth Distribution)
    const wealthDistribution: Record<string, number> = {};
    investments.forEach(inv => {
      const cat = inv.category.split(' ')[0]; // Group by first word
      wealthDistribution[cat] = (wealthDistribution[cat] || 0) + inv.amount;
    });
    const wealthChartData = Object.keys(wealthDistribution).map((key, index) => ({
      name: key,
      value: wealthDistribution[key],
      color: ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'][index % 5]
    }));

    // 8. ASSEMBLE PAYLOAD
    return NextResponse.json({
      kpis: {
        totalRevenue,
        totalWealth,
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
      recentInvoices: recentInvoices
    });

  } catch (error) {
    console.error("Dashboard Data Error:", error);
    return NextResponse.json({ error: 'Failed to aggregate dashboard data' }, { status: 500 });
  }
}
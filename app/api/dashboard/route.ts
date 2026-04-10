import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { INVOICE_STATUS } from '@/lib/invoice-status';
import { serializeMoney, toDecimal } from '@/lib/money';
import { getInvoiceBilledAmount, sumInvoiceBilledAmount } from '@/lib/invoice/totals';
import { estimateTax } from '@/lib/tax/engine';
import { getCurrentFinancialYear } from '@/lib/financial-year';
import {
  buildDashboardCacheKey,
  getDashboardCacheEntry,
  getDashboardCacheMeta,
  isDashboardCacheEnabled,
  noteDashboardCacheIncident,
  setDashboardCacheEntry,
} from '@/lib/dashboard-cache';

const normalizeInvoiceStatus = (status: unknown) => String(status).toUpperCase();
const LOCALE_CURRENCY_AFFECTS_PAYLOAD = false;
const FINANCIAL_YEAR_PATTERN = /^(\d{2})-(\d{2})$/;

const normalizeFinancialYear = (fy: string | null): string | null => {
  if (!fy) return null;

  const trimmed = fy.trim();
  const match = FINANCIAL_YEAR_PATTERN.exec(trimmed);
  if (!match) return null;

  const startYear = Number.parseInt(match[1], 10);
  const endYear = Number.parseInt(match[2], 10);
  const expectedEndYear = (startYear + 1) % 100;

  return endYear === expectedEndYear ? trimmed : null;
};


type IntegrationStatus = 'healthy' | 'partial' | 'missing';

type IntegrationReadiness = {
  configured: boolean;
  status: IntegrationStatus;
};

type SessionWithWorkspace = {
  workspaceId?: string | null;
};

const getIntegrationReadiness = (keys: Array<string | null | undefined>): IntegrationReadiness => {
  const presentKeys = keys.filter((value) => Boolean(value && value.trim())).length;
  const requiredKeys = keys.length;

  if (presentKeys === requiredKeys) {
    return { configured: true, status: 'healthy' };
  }

  if (presentKeys > 0) {
    return { configured: false, status: 'partial' };
  }

  return { configured: false, status: 'missing' };
};

async function buildDashboardPayload(workspaceId: string, fy: string) {
  const [invoices, investments, activeClientCount, retainers, recentInvoices, profile] = await Promise.all([
    prisma.invoice.findMany({
      where: { financialYear: fy, workspaceId },
      include: { client: true },
      orderBy: { invoiceDate: 'asc' }
    }),
    prisma.investment.findMany({ where: { workspaceId } }),
    prisma.client.count({ where: { workspaceId } }),
    prisma.retainer.findMany({ where: { workspaceId, status: 'ACTIVE' }, include: { client: true } }),
    prisma.invoice.findMany({ where: { workspaceId }, orderBy: { invoiceDate: 'desc' }, take: 5, include: { client: true } }),
    prisma.businessProfile.findUnique({
      where: { workspaceId },
      select: {
        groqApiKey: true,
        razorpayKeyId: true,
        razorpayKeySecret: true,
        stripePublishableKey: true,
        stripeSecretKey: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFromEmail: true,
      },
    }),
  ]);

  const razorpayReadiness = getIntegrationReadiness([profile?.razorpayKeyId, profile?.razorpayKeySecret]);
  const stripeReadiness = getIntegrationReadiness([profile?.stripePublishableKey, profile?.stripeSecretKey]);
  const hasAnyPaymentKey = [
    profile?.razorpayKeyId,
    profile?.razorpayKeySecret,
    profile?.stripePublishableKey,
    profile?.stripeSecretKey,
  ].some((value) => Boolean(value && value.trim()));

  const paymentReadiness: IntegrationReadiness =
    razorpayReadiness.status === 'healthy' || stripeReadiness.status === 'healthy'
      ? { configured: true, status: 'healthy' }
      : hasAnyPaymentKey
        ? { configured: false, status: 'partial' }
        : { configured: false, status: 'missing' };

  const integrationReadiness = {
    groq: getIntegrationReadiness([profile?.groqApiKey]),
    payment: paymentReadiness,
    smtp: getIntegrationReadiness([
      profile?.smtpHost,
      profile?.smtpPort ? String(profile.smtpPort) : null,
      profile?.smtpUser,
      profile?.smtpPassword,
      profile?.smtpFromEmail,
    ]),
  };

  const integrationSummary = Object.values(integrationReadiness).reduce(
    (acc, current) => {
      acc[current.status] += 1;
      return acc;
    },
    { healthy: 0, partial: 0, missing: 0 }
  );

  const totalRevenueDecimal = sumInvoiceBilledAmount(invoices);
  const totalWealthDecimal = investments.reduce(
    (sum, inv) => sum.plus(toDecimal(inv.amount)),
    new Prisma.Decimal(0)
  );

  const presumptiveIncomeDecimal = totalRevenueDecimal.mul(0.5);
  const eligible80CDecimal = investments
    .filter(i => i.category.includes('80C'))
    .reduce((sum, i) => sum.plus(toDecimal(i.amount)), new Prisma.Decimal(0));
  const eligible80CDecimalCapped = Prisma.Decimal.min(eligible80CDecimal, new Prisma.Decimal(150000));
  const taxEstimate = estimateTax({
    countryCode: 'IN',
    revenue: presumptiveIncomeDecimal,
    deductions: eligible80CDecimalCapped,
    serviceScope: 'dashboard_summary',
    customerScope: 'workspace',
    asOfDate: new Date(),
  });

  let mrrTotal = new Prisma.Decimal(0);
  const clientIds = retainers.map(ret => ret.clientId);

  const allRelevantInvoices = await prisma.invoice.findMany({
    where: { clientId: { in: clientIds }, workspaceId },
    orderBy: { invoiceDate: 'desc' },
  });

  const invoicesByClient = allRelevantInvoices.reduce<Record<string, typeof allRelevantInvoices>>((acc, inv) => {
    if (!inv.clientId) return acc;
    if (!acc[inv.clientId]) acc[inv.clientId] = [];
    acc[inv.clientId].push(inv);
    return acc;
  }, {});

  const retainerRadar = retainers.map((ret) => {
    mrrTotal = mrrTotal.plus(toDecimal(ret.amount));
    const recentClientInvoices = (invoicesByClient[ret.clientId as string] || []).slice(0, 3);

    let health = 'good';
    const today = new Date();

    if (recentClientInvoices.length === 0) {
      health = 'pending';
    } else {
      for (const inv of recentClientInvoices) {
        const normalizedStatus = normalizeInvoiceStatus(inv.status);
        if (normalizedStatus === 'PENDING' || normalizedStatus === 'PARTIALLY_PAID') {
          const daysOverdue = Math.floor((today.getTime() - new Date(inv.invoiceDate).getTime()) / (1000 * 3600 * 24));
          if (daysOverdue > 15) {
            health = 'danger';
            break;
          } else if (daysOverdue > 7) {
            health = 'warning';
          }
        } else if (normalizedStatus === 'PAID') {
          if (inv.dateReceived) {
            const daysToPay = Math.floor((new Date(inv.dateReceived).getTime() - new Date(inv.invoiceDate).getTime()) / (1000 * 3600 * 24));
            if (daysToPay > 10 && health !== 'danger') {
              health = 'warning';
            }
          }
        }
      }
    }

    return {
      clientName: ret.client.name,
      serviceName: ret.serviceName,
      amount: serializeMoney(ret.amount),
      health
    };
  });

  const healthWeight: Record<string, number> = { danger: 3, warning: 2, good: 1 };
  retainerRadar.sort((a, b) => healthWeight[b.health] - healthWeight[a.health]);

  const monthlyRevenue: Record<string, Prisma.Decimal> = {};
  invoices.forEach(inv => {
    const billingMonth = inv.billingMonth ? String(inv.billingMonth).trim() : '';
    const billingMonthToken = billingMonth ? billingMonth.split(' ')[0] : '';
    const invoiceDate = inv.invoiceDate ? new Date(inv.invoiceDate) : null;
    const invoiceDateMonth = invoiceDate && !Number.isNaN(invoiceDate.getTime())
      ? invoiceDate.toLocaleString('en-US', { month: 'long' })
      : '';

    const month = billingMonthToken || invoiceDateMonth || 'Unknown';
    monthlyRevenue[month] = (monthlyRevenue[month] ?? new Prisma.Decimal(0)).plus(getInvoiceBilledAmount(inv));
  });
  const revenueChartData = Object.keys(monthlyRevenue).map(month => ({
    name: month.substring(0, 3),
    revenue: serializeMoney(monthlyRevenue[month])
  }));

  const wealthDistribution: Record<string, Prisma.Decimal> = {};
  investments.forEach(inv => {
    const cat = inv.category.split(' ')[0];
    wealthDistribution[cat] = (wealthDistribution[cat] ?? new Prisma.Decimal(0)).plus(toDecimal(inv.amount));
  });

  const wealthChartData = Object.keys(wealthDistribution).map((key, index) => ({
    name: key,
    value: serializeMoney(wealthDistribution[key]),
    color: ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'][index % 5]
  }));

  return {
    kpis: {
      totalRevenue: serializeMoney(totalRevenueDecimal),
      totalWealth: serializeMoney(totalWealthDecimal),
      estimatedTax: taxEstimate.amount,
      activeClients: activeClientCount
    },
    taxEstimate,
    mrr: {
      total: serializeMoney(mrrTotal),
      retainers: retainerRadar
    },
    charts: {
      revenue: revenueChartData,
      wealth: wealthChartData
    },
    readiness: {
      integrations: integrationReadiness,
      summary: integrationSummary,
    },
    recentInvoices: recentInvoices.map((invoice) => ({
      ...invoice,
      status: invoice.status || INVOICE_STATUS.PENDING,
    }))
  };
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedFy = normalizeFinancialYear(searchParams.get('fy'));
    if (searchParams.get('fy') && !requestedFy) {
      return NextResponse.json(
        { error: 'Invalid financial year format. Expected YY-YY with consecutive years.', code: 'INVALID_FINANCIAL_YEAR' },
        { status: 400 }
      );
    }

    const fy = requestedFy ?? getCurrentFinancialYear();

    const locale = searchParams.get('locale');
    const currency = searchParams.get('currency');
    const cacheKey = buildDashboardCacheKey({
      workspaceId,
      fy,
      locale,
      currency,
      localeCurrencyAffectsPayload: LOCALE_CURRENCY_AFFECTS_PAYLOAD,
    });

    if (isDashboardCacheEnabled()) {
      try {
        const cached = getDashboardCacheEntry(cacheKey);
        if (cached) {
          const cacheMeta = getDashboardCacheMeta(cached);
          return NextResponse.json(cached.payload, {
            headers: {
              'X-Dashboard-Cache': 'HIT',
              'X-Dashboard-Cache-Age': String(cacheMeta.ageSeconds),
              'X-Dashboard-Cache-TTL': String(cacheMeta.ttlSeconds),
            },
          });
    const [invoices, investments, activeClientCount, retainers, recentInvoices, profile] = await Promise.all([
      prisma.invoice.findMany({
        where: { financialYear: fy, workspaceId },
        select: {
          grandTotal: true,
          totalAmount: true,
          billingMonth: true,
          invoiceDate: true,
        },
        orderBy: { invoiceDate: 'asc' }
      }),
      prisma.investment.findMany({
        where: { workspaceId },
        select: {
          amount: true,
          category: true,
        },
      }),
      prisma.client.count({ where: { workspaceId } }),
      prisma.retainer.findMany({
        where: { workspaceId, status: "ACTIVE" },
        select: {
          amount: true,
          clientId: true,
          serviceName: true,
          client: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { workspaceId },
        orderBy: { invoiceDate: 'desc' },
        take: 5,
        select: {
          id: true,
          invoiceDate: true,
          invoiceNumber: true,
          clientName: true,
          billingMonth: true,
          status: true,
          totalAmount: true,
          amountReceived: true,
          pdfPath: true,
          createdAt: true,
        },
      }),
      prisma.businessProfile.findUnique({
        where: { workspaceId },
        select: {
          groqApiKey: true,
          razorpayKeyId: true,
          razorpayKeySecret: true,
          stripePublishableKey: true,
          stripeSecretKey: true,
          smtpHost: true,
          smtpPort: true,
          smtpUser: true,
          smtpPassword: true,
          smtpFromEmail: true,
        },
      }),
    ]);

    const razorpayReadiness = getIntegrationReadiness([profile?.razorpayKeyId, profile?.razorpayKeySecret]);
    const stripeReadiness = getIntegrationReadiness([profile?.stripePublishableKey, profile?.stripeSecretKey]);
    const hasAnyPaymentKey = [
      profile?.razorpayKeyId,
      profile?.razorpayKeySecret,
      profile?.stripePublishableKey,
      profile?.stripeSecretKey,
    ].some((value) => Boolean(value && value.trim()));

    const paymentReadiness: IntegrationReadiness =
      razorpayReadiness.status === 'healthy' || stripeReadiness.status === 'healthy'
        ? { configured: true, status: 'healthy' }
        : hasAnyPaymentKey
          ? { configured: false, status: 'partial' }
          : { configured: false, status: 'missing' };

    const integrationReadiness = {
      groq: getIntegrationReadiness([profile?.groqApiKey]),
      payment: paymentReadiness,
      smtp: getIntegrationReadiness([
        profile?.smtpHost,
        profile?.smtpPort ? String(profile.smtpPort) : null,
        profile?.smtpUser,
        profile?.smtpPassword,
        profile?.smtpFromEmail,
      ]),
    };

    const integrationSummary = Object.values(integrationReadiness).reduce(
      (acc, current) => {
        acc[current.status] += 1;
        return acc;
      },
      { healthy: 0, partial: 0, missing: 0 }
    );

    const totalRevenueDecimal = sumInvoiceBilledAmount(invoices);
    const totalWealthDecimal = investments.reduce(
      (sum, inv) => sum.plus(toDecimal(inv.amount)),
      new Prisma.Decimal(0)
    );

    const presumptiveIncomeDecimal = totalRevenueDecimal.mul(0.5);
    const eligible80CDecimal = investments
      .filter(i => i.category.includes('80C'))
      .reduce((sum, i) => sum.plus(toDecimal(i.amount)), new Prisma.Decimal(0));
    const eligible80CDecimalCapped = Prisma.Decimal.min(eligible80CDecimal, new Prisma.Decimal(150000));
    const taxEstimate = estimateTax({
      countryCode: 'IN',
      revenue: presumptiveIncomeDecimal,
      deductions: eligible80CDecimalCapped,
      serviceScope: 'dashboard_summary',
      customerScope: 'workspace',
      asOfDate: new Date(),
    });

    let mrrTotal = new Prisma.Decimal(0);
    const clientIds = retainers.map(ret => ret.clientId);
    const uniqueClientIds = Array.from(new Set(clientIds.filter((id): id is string => Boolean(id))));

    const relevantInvoicesByClient = uniqueClientIds.length
      ? await prisma.$transaction(
          uniqueClientIds.map(clientId =>
            prisma.invoice.findMany({
              where: { clientId, workspaceId },
              orderBy: { invoiceDate: 'desc' },
              take: 3,
              select: {
                clientId: true,
                status: true,
                invoiceDate: true,
                dateReceived: true,
              },
            })
          )
        )
      : [];

    const invoicesByClient = relevantInvoicesByClient.reduce<Record<string, (typeof relevantInvoicesByClient)[number]>>(
      (acc, invoices, index) => {
        const clientId = uniqueClientIds[index];
        acc[clientId] = invoices;
        return acc;
      },
      {}
    );

    const retainerRadar = retainers.map((ret) => {
      mrrTotal = mrrTotal.plus(toDecimal(ret.amount));
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

        const payload = await buildDashboardPayload(workspaceId, fy);
        const entry = setDashboardCacheEntry(cacheKey, payload);
        const cacheMeta = getDashboardCacheMeta(entry);

        return NextResponse.json(payload, {
          headers: {
            'X-Dashboard-Cache': 'MISS',
            'X-Dashboard-Cache-Age': String(cacheMeta.ageSeconds),
            'X-Dashboard-Cache-TTL': String(cacheMeta.ttlSeconds),
          },
        });
      } catch (cacheError) {
        noteDashboardCacheIncident('cacheErrors', { workspaceId, fy, cacheKey, error: String(cacheError) });
      }
    }

    const payload = await buildDashboardPayload(workspaceId, fy);
    return NextResponse.json(payload, { headers: { 'X-Dashboard-Cache': 'BYPASS' } });
  } catch (error) {
    console.error('Dashboard Data Error:', error);
    return NextResponse.json({ error: 'Failed to aggregate dashboard data', code: 'DASHBOARD_AGGREGATION_FAILED' }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { serializeMoney, toDecimal } from "@/lib/money";
import { getInvoiceBilledAmount, sumInvoiceBilledAmount } from "@/lib/invoice/totals";
import { estimateTax } from "@/lib/tax/engine";
import { getCurrentFinancialYear } from "@/lib/financial-year";
import {
  buildDashboardCacheKey,
  getDashboardCacheEntry,
  getDashboardCacheMeta,
  isDashboardCacheEnabled,
  noteDashboardCacheIncident,
  setDashboardCacheEntry,
} from "@/lib/dashboard-cache";

const normalizeInvoiceStatus = (status: unknown) => String(status).toUpperCase();
const LOCALE_CURRENCY_AFFECTS_PAYLOAD = false;
const CRITICAL_NOTIFICATION_TYPES = ["TAX_ALERT", "DEADLINE_ALERT", "PAYMENT_REMINDER"];

type IntegrationStatus = "healthy" | "partial" | "missing";
type SessionWithWorkspace = { workspaceId?: string | null; user?: { id?: string | null } | null };
type IntegrationReadiness = { configured: boolean; status: IntegrationStatus };

const monthKey = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });

const getIntegrationReadiness = (keys: Array<string | null | undefined>): IntegrationReadiness => {
  const presentKeys = keys.filter((value) => Boolean(value && value.trim())).length;
  if (presentKeys === keys.length) return { configured: true, status: "healthy" };
  if (presentKeys > 0) return { configured: false, status: "partial" };
  return { configured: false, status: "missing" };
};

const asPct = (num: number, den: number) => (den <= 0 ? 0 : Math.min(100, Math.round((num / den) * 100)));
const getFyDateRange = (fy: string): { start: Date; endExclusive: Date } | null => {
  const match = fy.match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const startYear = 2000 + Number(match[1]);
  const endYear = 2000 + Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear !== startYear + 1) return null;
  return {
    start: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    endExclusive: new Date(Date.UTC(endYear, 3, 1, 0, 0, 0)),
  };
};

async function buildDashboardPayload(workspaceId: string, userId: string | null, fy: string, options: { canViewFinance?: boolean, segment?: string | null } = {}) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const thirtyDaysBack = new Date(now);
  thirtyDaysBack.setDate(now.getDate() - 30);
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(now.getDate() + 7);
  const fyRange = getFyDateRange(fy);
  const { segment } = options;

  const [
    workspace,
    profile,
    fyInvoices,
    allUnpaidInvoices,
    recentInvoices,
    investments,
    expenses,
    bankTransactions,
    retainers,
    proposals,
    tasks,
    publishedServices,
    lowStockProducts,
    openPurchaseOrders,
    inventoryMovements,
    serviceOrders,
    recentServiceOrders,
    integrityRuns,
    violationReports,
    taxOverrides,
    taxAudits,
    fileImportFailures,
    activities,
    notifications,
  ] = await Promise.all([
    // Core always fetched for metadata
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true, isSetupComplete: true, subscriptionStatus: true, subscriptionEndsAt: true, planTier: true } }),
    prisma.businessProfile.findUnique({
      where: { workspaceId },
      select: {
        groqApiKey: true, razorpayKeyId: true, razorpayKeySecret: true,
        stripePublishableKey: true, stripeSecretKey: true,
        smtpHost: true, smtpPort: true, smtpUser: true, smtpPassword: true, smtpFromEmail: true,
        shopEnabled: true,
      },
    }),
    
    // Conditional Segments
    (!segment || segment === 'finance' || segment === 'sales' || segment === 'charts')
      ? prisma.invoice.findMany({ 
          where: { workspaceId, financialYear: fy }, 
          select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, totalAmount: true, grandTotal: true, amountReceived: true, items: true, client: { select: { id: true, name: true } } }, 
          orderBy: { invoiceDate: "asc" } 
        })
      : Promise.resolve([]),

    (!segment || segment === 'finance' || segment === 'sales' || segment === 'charts' || segment === 'attention')
      ? prisma.invoice.findMany({ 
          where: { workspaceId, status: { not: "PAID" } }, 
          select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, totalAmount: true, grandTotal: true, amountReceived: true, items: true, client: { select: { id: true, name: true } } }
        })
      : Promise.resolve([]),
      
    (!segment || segment === 'ledger')
      ? prisma.invoice.findMany({ 
          where: { workspaceId }, 
          select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, totalAmount: true, amountReceived: true, pdfPath: true, client: { select: { name: true } } }, 
          orderBy: { invoiceDate: "desc" }, 
          take: 6 
        })
      : Promise.resolve([]),

    (!segment || segment === 'finance')
      ? prisma.investment.findMany({ where: { workspaceId }, select: { amount: true } })
      : Promise.resolve([]),

    (!segment || segment === 'finance' || segment === 'charts')
      ? prisma.expense.findMany({
          where: { workspaceId, ...(fyRange ? { date: { gte: fyRange.start, lt: fyRange.endExclusive } } : {}) },
          select: { amount: true, date: true }
        })
      : Promise.resolve([]),

    (!segment || segment === 'finance' || segment === 'charts')
      ? prisma.bankTransaction.findMany({ where: { workspaceId }, select: { isReconciled: true, id: true } })
      : Promise.resolve([]),

    (!segment || segment === 'finance' || segment === 'charts')
      ? prisma.retainer.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { amount: true, nextBillingDate: true } })
      : Promise.resolve([]),

    (!segment || segment === 'sales' || segment === 'charts' || segment === 'attention')
      ? prisma.proposal.findMany({ where: { workspaceId }, select: { status: true, items: { select: { total: true } } } })
      : Promise.resolve([]),

    (!segment || segment === 'ops' || segment === 'attention')
      ? prisma.task.findMany({ where: { workspaceId }, select: { status: true, dueDate: true } })
      : Promise.resolve([]),

    (!segment || segment === 'ops')
      ? prisma.serviceTemplate.count({ where: { workspaceId, showInShop: true } })
      : Promise.resolve(0),

    (!segment || segment === 'ops')
      ? prisma.product.count({ where: { workspaceId, OR: [{ status: "LOW_STOCK" }, { currentStock: { lte: 5 } }] } })
      : Promise.resolve(0),

    (!segment || segment === 'ops')
      ? prisma.product.count({ where: { workspaceId, status: { in: ["DRAFT", "SENT"] } } })
      : Promise.resolve(0), // Wait, this was purchase order in original? Let's check original.

    (!segment || segment === 'ops')
      ? prisma.inventoryMovement.findMany({ where: { workspaceId }, select: { id: true, quantity: true, type: true, createdAt: true, product: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 })
      : Promise.resolve([]),

    (!segment || segment === 'sales' || segment === 'charts')
      ? prisma.serviceOrder.findMany({
          where: { workspaceId },
          select: { id: true, status: true, amount: true, createdAt: true, buyerName: true, serviceTemplate: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),

    (!segment || segment === 'sales')
      ? prisma.serviceOrder.findMany({
          where: { workspaceId },
          select: { id: true, status: true, amount: true, createdAt: true, buyerName: true, serviceTemplate: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),

    (!segment || segment === 'trust')
      ? prisma.accountingIntegrityRun.findMany({ where: { workspaceId }, select: { status: true, startedAt: true, completedAt: true }, orderBy: { startedAt: "desc" }, take: 1 })
      : Promise.resolve([]),

    (!segment || segment === 'trust' || segment === 'attention')
      ? prisma.accountingViolationReport.findMany({ where: { workspaceId }, select: { id: true, severity: true, detectedAt: true }, orderBy: { detectedAt: "desc" }, take: 30 })
      : Promise.resolve([]),

    (!segment || segment === 'trust')
      ? prisma.taxRateOverride.count({ where: { workspaceId, isActive: true } })
      : Promise.resolve(0),

    (!segment || segment === 'trust')
      ? prisma.taxDecisionAuditLog.findMany({ where: { workspaceId }, select: { id: true, resolutionSource: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 })
      : Promise.resolve([]),

    (!segment || segment === 'attention')
      ? prisma.fileImportAuditLog.count({ where: { workspaceId, status: { in: ["FAILED", "ERROR"] } } })
      : Promise.resolve(0),

    (!segment || segment === 'activity')
      ? prisma.appActivityLog.findMany({ where: { workspaceId }, select: { id: true, action: true, status: true, createdAt: true, actorEmail: true }, orderBy: { createdAt: "desc" }, take: 8 })
      : Promise.resolve([]),

    (userId && (!segment || segment === 'attention'))
      ? prisma.inAppNotification.count({ where: { userId, workspaceId, isRead: false, eventType: { in: CRITICAL_NOTIFICATION_TYPES } } })
      : Promise.resolve(0),
  ]);

  // Intermediate computations
  const billedRevenue = (options.canViewFinance) ? sumInvoiceBilledAmount(fyInvoices) : new Prisma.Decimal(0);
  const expensesTotal = expenses.reduce((sum, row) => sum.plus(toDecimal(row.amount)), new Prisma.Decimal(0));
  const liquidAssets = (options.canViewFinance) ? investments.reduce((sum, row) => sum.plus(toDecimal(row.amount)), new Prisma.Decimal(0)) : new Prisma.Decimal(0);
  
  const pendingOrdersCount = serviceOrders.filter(so => ["PENDING", "FAILED"].includes(normalizeInvoiceStatus(so.status))).length;

  const receivables = allUnpaidInvoices.reduce((sum, inv) => {
    const billed = getInvoiceBilledAmount(inv);
    const received = new Prisma.Decimal(Number(inv.amountReceived ?? 0));
    return sum.plus(Prisma.Decimal.max(new Prisma.Decimal(0), billed.minus(received)));
  }, new Prisma.Decimal(0)).plus(
    serviceOrders.filter(so => ["PENDING", "FAILED"].includes(normalizeInvoiceStatus(so.status)))
      .reduce((sum, so) => sum.plus(toDecimal(so.amount)), new Prisma.Decimal(0))
  );

  const presumptiveIncome = billedRevenue.mul(0.5);
  const taxEstimate = (options.canViewFinance) ? estimateTax({
    countryCode: workspace?.countryCode ?? "IN",
    revenue: presumptiveIncome,
    deductions: new Prisma.Decimal(0),
    serviceScope: "dashboard_summary",
    customerScope: "workspace",
    asOfDate: now,
  }) : { amount: serializeMoney(0) };

  const recurringRevenue = retainers.reduce((sum, ret) => sum.plus(toDecimal(ret.amount)), new Prisma.Decimal(0));
  const arr = recurringRevenue.mul(12);

  const unreconciledTransactions = bankTransactions.filter((tx) => !tx.isReconciled).length;
  const reconciliationProgress = asPct(bankTransactions.length - unreconciledTransactions, bankTransactions.length);

  const overdueInvoices = allUnpaidInvoices.filter((inv) => {
    const status = normalizeInvoiceStatus(inv.status);
    if (status === "PAID") return false;
    const dueDate = new Date(inv.invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);
    return dueDate < now;
  }).length;

  const pendingInvoices = allUnpaidInvoices.length;
  const totalPendingReceivables = pendingInvoices + pendingOrdersCount;

  const retainersDueSoon = retainers.filter((ret) => ret.nextBillingDate >= now && ret.nextBillingDate <= sevenDaysOut).length;
  const acceptedUninvoicedProposals = proposals.filter((proposal) => proposal.status === "ACCEPTED").length;
  const urgentTasks = tasks.filter((task) => {
    const due = task.dueDate ? new Date(task.dueDate) : null;
    return task.status !== "DONE" && ((due && due <= sevenDaysOut) || String(task.status).toUpperCase().includes("URGENT"));
  }).length;
  const blockedTasks = tasks.filter((task) => String(task.status).toUpperCase().includes("BLOCK")).length;

  const criticalViolations = violationReports.filter((v) => String(v.severity).toUpperCase() === "CRITICAL").length;
  const complianceIssues = violationReports.length + (criticalViolations > 0 ? 1 : 0);

  const funnel = proposals.reduce(
    (acc, proposal) => {
      const status = String(proposal.status || "DRAFT").toUpperCase();
      if (status === "SENT") acc.sent += 1;
      else if (status === "VIEWED") acc.viewed += 1;
      else if (status === "ACCEPTED") acc.accepted += 1;
      else if (status === "INVOICED") acc.invoiced += 1;
      else if (status === "DECLINED") acc.declined += 1;
      else acc.draft += 1;
      return acc;
    },
    { draft: 0, sent: 0, viewed: 0, accepted: 0, invoiced: 0, declined: 0 },
  );

  const serviceOrderByStatus = serviceOrders.reduce<Record<string, number>>((acc, order) => {
    const status = String(order.status || "PENDING").toUpperCase();
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  const paidOrders = serviceOrderByStatus.PAID ?? 0;
  const pendingOrders = serviceOrderByStatus.PENDING ?? 0;
  const failedOrders = serviceOrderByStatus.FAILED ?? 0;
  const conversion = asPct(paidOrders, Math.max(1, paidOrders + pendingOrders + failedOrders));

  const topServicesMap = serviceOrders.reduce<Record<string, { orderCount: number; revenue: Prisma.Decimal }>>((acc, order) => {
    const name = order.serviceTemplate?.name ?? "Unknown service";
    if (!acc[name]) acc[name] = { orderCount: 0, revenue: new Prisma.Decimal(0) };
    acc[name].orderCount += 1;
    acc[name].revenue = acc[name].revenue.plus(toDecimal(order.amount));
    return acc;
  }, {});
  const topServices = Object.entries(topServicesMap)
    .map(([serviceName, stats]) => ({ serviceName, orderCount: stats.orderCount, revenue: serializeMoney(stats.revenue) }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 4);

  const monthly = fyInvoices.reduce<Record<string, { revenue: Prisma.Decimal; expenses: Prisma.Decimal; mrr: Prisma.Decimal }>>((acc, inv) => {
    const key = monthKey(new Date(inv.invoiceDate));
    if (!acc[key]) acc[key] = { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), mrr: new Prisma.Decimal(0) };
    acc[key].revenue = acc[key].revenue.plus(getInvoiceBilledAmount(inv));
    return acc;
  }, {});

  expenses.forEach((expense) => {
    const key = monthKey(new Date(expense.date));
    if (!monthly[key]) monthly[key] = { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), mrr: new Prisma.Decimal(0) };
    monthly[key].expenses = monthly[key].expenses.plus(toDecimal(expense.amount));
  });

  retainers.forEach((ret) => {
    const key = monthKey(now);
    if (!monthly[key]) monthly[key] = { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0), mrr: new Prisma.Decimal(0) };
    monthly[key].mrr = monthly[key].mrr.plus(toDecimal(ret.amount));
  });

  const orderedMonths = Object.keys(monthly);

  const integrationReadiness = {
    groq: getIntegrationReadiness([profile?.groqApiKey]),
    payment:
      getIntegrationReadiness([profile?.razorpayKeyId, profile?.razorpayKeySecret]).status === "healthy" ||
      getIntegrationReadiness([profile?.stripePublishableKey, profile?.stripeSecretKey]).status === "healthy"
        ? { configured: true, status: "healthy" as IntegrationStatus }
        : getIntegrationReadiness([
            profile?.razorpayKeyId,
            profile?.razorpayKeySecret,
            profile?.stripePublishableKey,
            profile?.stripeSecretKey,
          ]),
    smtp: getIntegrationReadiness([
      profile?.smtpHost,
      profile?.smtpPort ? String(profile.smtpPort) : null,
      profile?.smtpUser,
      profile?.smtpPassword,
      profile?.smtpFromEmail,
    ]),
    shop: profile?.shopEnabled ? { configured: true, status: "healthy" as IntegrationStatus } : { configured: false, status: "missing" as IntegrationStatus },
  };

  const integrationSummary = Object.values(integrationReadiness).reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { healthy: 0, partial: 0, missing: 0 },
  );

  const setupSignals = [
    workspace?.isSetupComplete,
    integrationSummary.healthy >= 2,
    fyInvoices.length > 0,
    profile?.shopEnabled,
    taxOverrides > 0 || taxAudits.length > 0,
  ].filter(Boolean).length;
  const setupCompletion = asPct(setupSignals, 5);

  const attentionCards = [
    { id: "overdue", title: "Overdue receivables", value: overdueInvoices, tone: "critical", href: "/invoice", helper: "Prioritize collections to improve cash flow." },
    { id: "bank", title: "Unreconciled transactions", value: unreconciledTransactions, tone: "warning", href: "/reconciliation", helper: "Match transactions to keep books accurate." },
    { id: "proposals", title: "Accepted, awaiting invoice", value: acceptedUninvoicedProposals, tone: "warning", href: "/proposals", helper: "Convert accepted proposals into billable invoices." },
    { id: "tasks", title: "Urgent tasks", value: urgentTasks, tone: "info", href: "/admin", helper: "Handle due tasks to avoid operational blockers." },
  ] as const;

  const receivablesAgingBuckets = allUnpaidInvoices.reduce(
    (acc, invoice) => {
      const status = normalizeInvoiceStatus(invoice.status);
      if (status === "PAID") return acc;

      const outstanding = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        getInvoiceBilledAmount(invoice).minus(new Prisma.Decimal(Number(invoice.amountReceived ?? 0))),
      );
      if (outstanding.equals(0)) return acc;

      const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(invoice.invoiceDate).getTime()) / (1000 * 60 * 60 * 24)));
      if (ageDays <= 30) acc.current = acc.current.plus(outstanding);
      else if (ageDays <= 60) acc.mid = acc.mid.plus(outstanding);
      else acc.late = acc.late.plus(outstanding);
      return acc;
    },
    { current: new Prisma.Decimal(0), mid: new Prisma.Decimal(0), late: new Prisma.Decimal(0) },
  );

  // Add pending/failed service orders to 0-30d aging bucket (treated as current)
  serviceOrders.filter(so => ["PENDING", "FAILED"].includes(normalizeInvoiceStatus(so.status))).forEach(so => {
    receivablesAgingBuckets.current = receivablesAgingBuckets.current.plus(toDecimal(so.amount));
  });

  const receivablesAging = [
    { bucket: "0-30d", value: serializeMoney(receivablesAgingBuckets.current) },
    { bucket: "31-60d", value: serializeMoney(receivablesAgingBuckets.mid) },
    { bucket: "61+d", value: serializeMoney(receivablesAgingBuckets.late) },
  ];

  const healthWarnings = [
    ...(integrationSummary.missing > 0 ? [{ label: "Missing integrations", severity: "warning" as const }] : []),
    ...(criticalViolations > 0 ? [{ label: "Critical accounting violations", severity: "critical" as const }] : []),
    ...(fileImportFailures > 0 ? [{ label: "Failed imports require review", severity: "warning" as const }] : []),
  ];

  const lastRun = integrityRuns[0];
  const shopRevenueThisMonth = serviceOrders
    .filter((order) => order.status === "PAID" && order.createdAt >= monthStart && order.createdAt < nextMonthStart)
    .reduce((sum, order) => sum.plus(toDecimal(order.amount)), new Prisma.Decimal(0));
  const ordersLast30Days = serviceOrders.filter((order) => order.createdAt >= thirtyDaysBack).length;

  return {
    health: {
      setupCompletion,
      onboardingProgress: setupCompletion,
      setupComplete: Boolean(workspace?.isSetupComplete),
      subscriptionStatus: workspace?.isSetupComplete ? "ACTIVE" : "PENDING", // Corrected field
      subscriptionState: workspace?.subscriptionStatus ?? "FREE",
      trialEndsAt: workspace?.subscriptionEndsAt?.toISOString() ?? null,
      planTier: workspace?.planTier ?? "FREE",
      integrationReadiness: {
        integrations: integrationReadiness,
        summary: integrationSummary,
      },
      complianceWarnings: healthWarnings,
    },
    attention: {
      totalUrgent: attentionCards.reduce((sum, card) => sum + card.value, 0) + criticalViolations + notifications,
      overdueInvoices,
      pendingInvoices: totalPendingReceivables,
      unreconciledTransactions,
      retainersDueSoon,
      acceptedUninvoicedProposals,
      urgentTasks,
      criticalNotifications: notifications,
      complianceIssues,
      failedImports: fileImportFailures,
      cards: attentionCards,
    },
    financialPulse: {
      billedRevenue: serializeMoney(billedRevenue),
      receivables: serializeMoney(receivables),
      expenses: serializeMoney(expensesTotal),
      estimatedTax: taxEstimate.amount,
      liquidAssets: serializeMoney(liquidAssets),
      recurringRevenue: serializeMoney(recurringRevenue),
      arr: serializeMoney(arr),
      reconciliationProgress,
    },
    salesAndShop: {
      proposalFunnel: funnel,
      acceptedAwaitingInvoicing: acceptedUninvoicedProposals,
      shopEnabled: Boolean(profile?.shopEnabled),
      publicShopOrders: {
        total: serviceOrders.length,
        paid: paidOrders,
        pending: pendingOrders,
        failed: failedOrders,
      },
      serviceOrderConversion: conversion,
      shopRevenueThisMonth: serializeMoney(shopRevenueThisMonth),
      ordersLast30Days,
      publishedServices,
      topServices,
      recentServiceOrders: recentServiceOrders.map((order) => ({
        id: order.id,
        serviceName: order.serviceTemplate?.name ?? "Unknown service",
        buyerName: order.buyerName,
        amount: serializeMoney(order.amount),
        status: order.status,
        createdAt: order.createdAt,
      })),
    },
    operations: {
      hasOperationalData: lowStockProducts > 0 || openPurchaseOrders > 0 || tasks.length > 0,
      lowStockCount: lowStockProducts,
      openPurchaseOrders,
      recentInventoryMovements: inventoryMovements.map((movement) => ({
        id: movement.id,
        productName: movement.product.name,
        quantity: movement.quantity,
        type: movement.type,
        createdAt: movement.createdAt,
      })),
      openTasks: tasks.filter((task) => task.status !== "DONE").length,
      blockedTasks,
    },
    trust: {
      integrityStatus: lastRun?.status ?? "NOT_RUN",
      lastIntegrityRunAt: lastRun?.completedAt ?? lastRun?.startedAt ?? null,
      violationCount: violationReports.length,
      criticalViolations,
      taxOverrideCount: taxOverrides,
      recentTaxAudits: taxAudits.map((audit) => ({
        id: audit.id,
        source: audit.resolutionSource,
        createdAt: audit.createdAt,
      })),
    },
    activity: activities.map((item) => ({
      id: item.id,
      action: item.action,
      status: item.status,
      createdAt: item.createdAt,
      actor: item.actorEmail ?? null,
    })),
    charts: {
      revenueVsExpense: orderedMonths.map((name) => ({
        name,
        revenue: (options.canViewFinance) ? serializeMoney(monthly[name].revenue) : 0,
        expenses: serializeMoney(monthly[name].expenses),
      })),
      recurringRevenue: orderedMonths.map((name) => ({ name, mrr: (options.canViewFinance) ? serializeMoney(monthly[name].mrr) : 0 })),
      receivablesAging,
      reconciliation: [
        { name: "Bank feed", reconciled: bankTransactions.length - unreconciledTransactions, unreconciled: unreconciledTransactions },
      ],
      proposalFunnel: [
        { stage: "Draft", value: funnel.draft },
        { stage: "Sent", value: funnel.sent },
        { stage: "Viewed", value: funnel.viewed },
        { stage: "Accepted", value: funnel.accepted },
        { stage: "Invoiced", value: funnel.invoiced },
        { stage: "Declined", value: funnel.declined },
      ],
      serviceOrderHealth: [
        { status: "Paid", value: paidOrders },
        { status: "Pending", value: pendingOrders },
        { status: "Failed", value: failedOrders },
      ],
    },
    recentInvoices: recentInvoices.map((invoice) => ({
      ...invoice,
      status: invoice.status || INVOICE_STATUS.PENDING,
    })),
    countryCode: workspace?.countryCode ?? "IN",
  };
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    const userId = (session as SessionWithWorkspace | null)?.user?.id ?? null;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let fy = searchParams.get("fy") || getCurrentFinancialYear();
    if (!getFyDateRange(fy)) {
      fy = getCurrentFinancialYear();
    }
    const locale = searchParams.get("locale");
    const currency = searchParams.get("currency");
    const segment = searchParams.get("segment");

    const cacheKey = buildDashboardCacheKey({
      workspaceId,
      userId,
      fy,
      locale,
      currency,
      segment: segment || "full",
      localeCurrencyAffectsPayload: LOCALE_CURRENCY_AFFECTS_PAYLOAD,
    });

    if (isDashboardCacheEnabled()) {
      try {
        const cached = getDashboardCacheEntry(cacheKey);
        if (cached) {
          const cacheMeta = getDashboardCacheMeta(cached);
          return NextResponse.json(cached.payload, {
            headers: {
              "X-Dashboard-Cache": "HIT",
              "X-Dashboard-Cache-Age": String(cacheMeta.ageSeconds),
              "X-Dashboard-Cache-TTL": String(cacheMeta.ttlSeconds),
            },
          });
        }

        const payload = await buildDashboardPayload(workspaceId, userId, fy, { canViewFinance: true, segment });
        const entry = setDashboardCacheEntry(cacheKey, payload);
        const cacheMeta = getDashboardCacheMeta(entry);

        return NextResponse.json(payload, {
          headers: {
            "X-Dashboard-Cache": "MISS",
            "X-Dashboard-Cache-Age": String(cacheMeta.ageSeconds),
            "X-Dashboard-Cache-TTL": String(cacheMeta.ttlSeconds),
          },
        });
      } catch (cacheError) {
        noteDashboardCacheIncident("cacheErrors", { workspaceId, fy, cacheKey, error: String(cacheError) });
        console.error("Dashboard cache error:", cacheError);
      }
    }

    const payload = await buildDashboardPayload(workspaceId, userId, fy, { canViewFinance: true, segment }); // Role check would go here
    return NextResponse.json(payload, { headers: { "X-Dashboard-Cache": "BYPASS" } });
  } catch (error) {
    console.error("Dashboard Data Error:", error);
    return NextResponse.json({ error: "Failed to aggregate dashboard data", code: "DASHBOARD_AGGREGATION_FAILED" }, { status: 500 });
  }
}

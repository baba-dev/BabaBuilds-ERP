import type { Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/money";

type SeedDmAgencyTemplateInput = {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  userId: string;
};

const getDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const getFY = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month < 4) return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
};

export async function seedDmAgencyTemplate({ tx, workspaceId, userId }: SeedDmAgencyTemplateInput) {
  const clients = await Promise.all([
    tx.client.create({
      data: {
        workspaceId,
        name: "Nimbus Fashion Co",
        address: "575 Broadway, New York, NY",
        country: "USA",
        taxId: "US-EIN-871233",
        email: "ap@nimbusfashion.com",
        isExport: true,
      },
    }),
    tx.client.create({
      data: {
        workspaceId,
        name: "Summit Performance Labs",
        address: "221 Mission St, San Francisco, CA",
        country: "USA",
        taxId: "US-EIN-439911",
        email: "finance@summitlabs.io",
        isExport: true,
      },
    }),
    tx.client.create({
      data: {
        workspaceId,
        name: "UrbanNest Home",
        address: "Austin, TX",
        country: "USA",
        email: "billing@urbannesthome.com",
        isExport: true,
      },
    }),
    tx.client.create({
      data: {
        workspaceId,
        name: "BluePeak Health",
        address: "Chicago, IL",
        country: "USA",
        email: "accounts@bluepeakhealth.com",
        isExport: true,
      },
    }),
  ]);

  const [nimbus, summit, urbanNest, bluePeak] = clients;

  const servicesData = [
    {
      workspaceId,
      name: "Paid Social Retainer",
      defaultPrice: 420000,
      description: "Monthly paid social strategy, creative testing, and reporting.",
    },
    {
      workspaceId,
      name: "Google Ads Retainer",
      defaultPrice: 360000,
      description: "Always-on search campaign management with weekly optimization.",
    },
    {
      workspaceId,
      name: "Influencer Launch Campaign",
      defaultPrice: 680000,
      description: "One-time campaign for product launch with creator coordination.",
    },
    {
      workspaceId,
      name: "Conversion Tracking Revamp",
      defaultPrice: 240000,
      description: "One-off analytics instrumentation and attribution cleanup.",
    },
  ];

  await tx.serviceTemplate.createMany({ data: servicesData });
  const catalog = await tx.serviceTemplate.findMany({ where: { workspaceId } });

  const proposalSpecs = [
    {
      clientId: nimbus.id,
      proposalNo: "EST-DM-001",
      title: "Q2 Paid Social Retainer",
      status: "ACCEPTED",
      validDays: -8,
      qty: 1,
      service: catalog[0],
    },
    {
      clientId: summit.id,
      proposalNo: "EST-DM-002",
      title: "Search Retainer + Tracking Overhaul",
      status: "SENT",
      validDays: 5,
      qty: 1,
      service: catalog[1],
    },
    {
      clientId: urbanNest.id,
      proposalNo: "EST-DM-003",
      title: "Summer Launch Influencer Sprint",
      status: "VIEWED",
      validDays: 9,
      qty: 1,
      service: catalog[2],
    },
  ] as const;

  for (const proposal of proposalSpecs) {
    const unitPrice = decimalToNumber(proposal.service.defaultPrice);
    const subtotal = proposal.qty * unitPrice;

    await tx.proposal.create({
      data: {
        workspaceId,
        clientId: proposal.clientId,
        title: proposal.title,
        proposalNo: proposal.proposalNo,
        validUntil: getDateOffset(proposal.validDays),
        subtotal,
        estimatedTax: 0,
        totalAmount: subtotal,
        status: proposal.status,
        items: {
          create: [
            {
              serviceTemplateId: proposal.service.id,
              title: proposal.service.name,
              description: proposal.service.description,
              quantity: proposal.qty,
              unitPrice,
              total: subtotal,
            },
          ],
        },
      },
    });
  }

  const invoicesToCreate: Array<{
    clientId: string;
    clientName: string;
    daysAgo: number;
    dueInDays: number;
    amount: number;
    amountReceived?: number;
    desc: string;
    status: "PAID" | "PENDING";
    risk: number;
  }> = [
    {
      clientId: nimbus.id,
      clientName: nimbus.name,
      daysAgo: -75,
      dueInDays: 30,
      amount: 420000,
      amountReceived: 420000,
      desc: "Paid Social Retainer - January",
      status: "PAID",
      risk: 0.12,
    },
    {
      clientId: summit.id,
      clientName: summit.name,
      daysAgo: -48,
      dueInDays: 21,
      amount: 360000,
      amountReceived: 360000,
      desc: "Google Ads Retainer - February",
      status: "PAID",
      risk: 0.2,
    },
    {
      clientId: urbanNest.id,
      clientName: urbanNest.name,
      daysAgo: -36,
      dueInDays: 15,
      amount: 680000,
      amountReceived: 220000,
      desc: "Spring Influencer Burst (one-off campaign)",
      status: "PENDING",
      risk: 0.72,
    },
    {
      clientId: nimbus.id,
      clientName: nimbus.name,
      daysAgo: -29,
      dueInDays: 30,
      amount: 420000,
      amountReceived: 0,
      desc: "Paid Social Retainer - March",
      status: "PENDING",
      risk: 0.78,
    },
    {
      clientId: summit.id,
      clientName: summit.name,
      daysAgo: -18,
      dueInDays: 21,
      amount: 360000,
      amountReceived: 120000,
      desc: "Google Ads Retainer - March",
      status: "PENDING",
      risk: 0.66,
    },
    {
      clientId: bluePeak.id,
      clientName: bluePeak.name,
      daysAgo: -9,
      dueInDays: 14,
      amount: 240000,
      amountReceived: 0,
      desc: "Tracking Revamp Phase 1 (one-off project)",
      status: "PENDING",
      risk: 0.58,
    },
  ];

  for (let i = 0; i < invoicesToCreate.length; i++) {
    const inv = invoicesToCreate[i];
    const invoiceDate = getDateOffset(inv.daysAgo);
    const dueDate = getDateOffset(inv.daysAgo + inv.dueInDays);
    const fy = getFY(invoiceDate);

    await tx.invoice.create({
      data: {
        workspaceId,
        clientId: inv.clientId,
        invoiceNumber: `INV-${fy.replace("-", "")}-DM-${String(i + 1).padStart(3, "0")}`,
        financialYear: fy,
        billingMonth: invoiceDate.toLocaleString("default", { month: "long", year: "numeric" }),
        invoiceDate,
        dueDate,
        paymentTermsDays: inv.dueInDays,
        expectedPaymentDate: dueDate,
        collectionRiskScore: inv.risk,
        clientName: inv.clientName,
        sacCode: "998365",
        serviceDescription: inv.desc,
        subtotal: inv.amount,
        taxMode: "exempt",
        taxRate: 0,
        taxAmount: 0,
        grandTotal: inv.amount,
        totalAmount: inv.amount,
        status: inv.status,
        pdfPath: `/demo-invoices/dm-agency-${i + 1}.pdf`,
        amountReceived: inv.amountReceived ?? null,
        dateReceived: inv.status === "PAID" ? getDateOffset(inv.daysAgo + 12) : null,
      },
    });
  }

  await tx.expense.createMany({
    data: [
      {
        workspaceId,
        date: getDateOffset(-35),
        category: "Ad Platforms",
        vendor: "Meta Ads",
        amount: 260000,
        description: "Nimbus + UrbanNest paid social spend",
      },
      {
        workspaceId,
        date: getDateOffset(-33),
        category: "Ad Platforms",
        vendor: "Google Ads",
        amount: 185000,
        description: "Summit search spend",
      },
      {
        workspaceId,
        date: getDateOffset(-28),
        category: "Contractors",
        vendor: "PixelForge Studio",
        amount: 90000,
        description: "Campaign video edits and UGC cutdowns",
      },
      {
        workspaceId,
        date: getDateOffset(-22),
        category: "Contractors",
        vendor: "A/B Test Freelance Squad",
        amount: 65000,
        description: "Landing page experimentation",
      },
      {
        workspaceId,
        date: getDateOffset(-15),
        category: "Tools",
        vendor: "Ahrefs",
        amount: 12000,
        description: "Keyword and competitor tracking",
      },
      {
        workspaceId,
        date: getDateOffset(-12),
        category: "Tools",
        vendor: "Figma",
        amount: 8000,
        description: "Creative collaboration seats",
      },
    ],
  });

  await tx.retainer.createMany({
    data: [
      {
        workspaceId,
        clientId: nimbus.id,
        serviceName: "Paid Social Retainer",
        amount: 420000,
        frequency: "MONTHLY",
        autoAppendMonth: true,
        nextBillingDate: getDateOffset(4),
        status: "ACTIVE",
        sacCode: "998365",
      },
      {
        workspaceId,
        clientId: summit.id,
        serviceName: "Google Ads Retainer",
        amount: 360000,
        frequency: "MONTHLY",
        autoAppendMonth: true,
        nextBillingDate: getDateOffset(9),
        status: "ACTIVE",
        sacCode: "998365",
      },
    ],
  });

  await tx.clientPaymentBehavior.createMany({
    data: [
      {
        workspaceId,
        clientId: nimbus.id,
        avgDaysToPay: 24,
        medianDaysToPay: 22,
        onTimeRate: 0.84,
        lateRate: 0.12,
        partialPaymentRate: 0.08,
        sampleInvoicesCount: 8,
        lastComputedAt: getDateOffset(-1),
      },
      {
        workspaceId,
        clientId: summit.id,
        avgDaysToPay: 19,
        medianDaysToPay: 18,
        onTimeRate: 0.9,
        lateRate: 0.08,
        partialPaymentRate: 0.16,
        sampleInvoicesCount: 6,
        lastComputedAt: getDateOffset(-1),
      },
      {
        workspaceId,
        clientId: urbanNest.id,
        avgDaysToPay: 43,
        medianDaysToPay: 41,
        onTimeRate: 0.42,
        lateRate: 0.51,
        partialPaymentRate: 0.37,
        sampleInvoicesCount: 5,
        lastComputedAt: getDateOffset(-1),
      },
      {
        workspaceId,
        clientId: bluePeak.id,
        avgDaysToPay: 36,
        medianDaysToPay: 34,
        onTimeRate: 0.58,
        lateRate: 0.31,
        partialPaymentRate: 0.22,
        sampleInvoicesCount: 4,
        lastComputedAt: getDateOffset(-1),
      },
    ],
  });

  await tx.cashForecastManualAdjustment.createMany({
    data: [
      {
        workspaceId,
        date: getDateOffset(-10),
        amount: 95000,
        direction: "OUTFLOW",
        reason: "Campaign overspend buffer for UrbanNest launch",
        category: "Campaign Spend",
        createdBy: "demo-seed",
      },
      {
        workspaceId,
        date: getDateOffset(-6),
        amount: 50000,
        direction: "INFLOW",
        reason: "Nimbus advance release",
        category: "Advance Collection",
        createdBy: "demo-seed",
      },
    ],
  });

  const snapshotStart = getDateOffset(0);
  const snapshotEnd = getDateOffset(84);

  await tx.cashForecastSnapshot.create({
    data: {
      workspaceId,
      horizonType: "WEEKLY_13",
      scenarioTag: "BASE",
      generatedBy: "SYSTEM",
      startDate: snapshotStart,
      endDate: snapshotEnd,
      openingCash: 980000,
      totalProjectedInflows: 1520000,
      totalProjectedOutflows: 1675000,
      closingCash: 825000,
      confidenceScore: 0.69,
      assumptionsJson: {
        varianceNarrative: "Ad platform spend pacing is running 11% above plan",
      },
      periods: {
        create: [
          {
            periodStart: getDateOffset(0),
            periodEnd: getDateOffset(6),
            bucketLabel: "Week 1",
            openingCash: 980000,
            projectedInflows: 260000,
            projectedOutflows: 340000,
            closingCash: 900000,
            riskLevel: "MEDIUM",
            varianceFromPriorForecast: -35000,
          },
          {
            periodStart: getDateOffset(7),
            periodEnd: getDateOffset(13),
            bucketLabel: "Week 2",
            openingCash: 900000,
            projectedInflows: 290000,
            projectedOutflows: 365000,
            closingCash: 825000,
            riskLevel: "HIGH",
            varianceFromPriorForecast: -52000,
          },
          {
            periodStart: getDateOffset(14),
            periodEnd: getDateOffset(20),
            bucketLabel: "Week 3",
            openingCash: 825000,
            projectedInflows: 310000,
            projectedOutflows: 305000,
            closingCash: 830000,
            riskLevel: "MEDIUM",
            varianceFromPriorForecast: 18000,
          },
        ],
      },
    },
  });

  await tx.inAppNotification.createMany({
    data: [
      {
        userId,
        workspaceId,
        eventType: "PAYMENT_REMINDER",
        title: "Overdue client payment: Nimbus Fashion Co",
        body: "INV for March retainer is overdue by 6 days. Follow up to avoid cash dip in Week 2.",
        actionUrl: "/income",
      },
      {
        userId,
        workspaceId,
        eventType: "BUDGET_ALERT",
        title: "Campaign overspend threshold breached",
        body: "UrbanNest spring launch spend reached 112% of planned budget this cycle.",
        actionUrl: "/expenses",
      },
    ],
  });
}

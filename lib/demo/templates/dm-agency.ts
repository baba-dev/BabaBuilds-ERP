import type { DemoTemplateDefinition } from '@/lib/demo/templates/types';

export const dmAgencyTemplate: DemoTemplateDefinition = {
  key: 'dm_agency',
  label: 'Digital Marketing Agency',
  shortDescription: 'Campaign retainers, receivables, cash-flow variance, and pipeline follow-ups.',
  workspace: {
    name: 'BabaBuilds Demo Enterprise',
    countryCode: 'IN',
    baseCurrency: 'INR',
    planTier: 'PRO',
    subscriptionStatus: 'ACTIVE',
  },
  businessProfile: {
    companyName: 'Nexus Digital Agency',
    proprietorName: 'Aditya Sharma',
    address: 'Level 4, Tech Park, Koramangala, Bangalore, KA 560034',
    email: 'billing@nexusdigital.demo',
    phone: '+91 98765 43210',
    website: 'https://nexusdigital.demo',
    panNumber: 'ABCDE1234F',
    udyamNumber: 'UDYAM-KR-00-1234567',
    gstin: '29ABCDE1234F1Z5',
    bankName: 'HDFC Bank Ltd.',
    accountName: 'Nexus Digital Agency',
    accountNumber: '50200012345678',
    ifscCode: 'HDFC0001234',
    groqApiKeyPlaintext: 'gsk_demo_bypass_key_placeholder',
    defaultSacCode: '998313',
    defaultTaxRate: 18,
  },
  clients: [
    {
      ref: 'stark',
      name: 'Stark Industries (US)',
      address: 'Malibu Point 10880, CA',
      country: 'USA',
      taxId: 'US-EIN-987654',
      email: 'accounts@stark.com',
      isExport: true,
    },
    {
      ref: 'wayne',
      name: 'Wayne Enterprises',
      address: 'Gotham Tower, NY',
      country: 'USA',
      email: 'finance@wayne.com',
      isExport: true,
    },
    {
      ref: 'reliance',
      name: 'Reliance Retail',
      address: 'Navi Mumbai, MH',
      country: 'India',
      taxId: '27RELIANCE1234Z',
      email: 'vendor.payments@ril.com',
      isExport: false,
    },
    {
      ref: 'zomato',
      name: 'Zomato Ltd',
      address: 'Gurugram, HR',
      country: 'India',
      taxId: '06ZOMATO8888P1Z1',
      email: 'tech.billing@zomato.com',
      isExport: false,
    },
    {
      ref: 'acme',
      name: 'Acme Startups',
      address: 'HSR Layout, Bangalore',
      country: 'India',
      email: 'founder@acmestartups.in',
      isExport: false,
    },
  ],
  services: [
    {
      ref: 'webapp',
      name: 'Full-Stack Web App Development',
      defaultPrice: 150000,
      description: 'End-to-end custom Next.js & Node.js application design and deployment.',
    },
    {
      ref: 'seo',
      name: 'SEO Audit & Strategy',
      defaultPrice: 25000,
      description: 'Comprehensive technical SEO audit, keyword mapping, and competitor analysis.',
    },
    {
      ref: 'cloud',
      name: 'Cloud Infrastructure Setup',
      defaultPrice: 45000,
      description: 'AWS/GCP scalable architecture design, dockerization, and CI/CD pipelines.',
    },
    {
      ref: 'maint',
      name: 'Monthly Maintenance Retainer',
      defaultPrice: 15000,
      description: 'Priority bug fixes, server monitoring, and minor feature updates.',
    },
  ],
  proposals: [
    {
      proposalNo: 'EST-26-001',
      clientRef: 'zomato',
      serviceRef: 'webapp',
      title: 'Zomato Next-Gen Fleet Dashboard',
      status: 'ACCEPTED',
      validDays: -5,
      quantity: 1,
    },
    {
      proposalNo: 'EST-26-002',
      clientRef: 'acme',
      serviceRef: 'seo',
      title: 'Acme Launch SEO Package',
      status: 'SENT',
      validDays: 10,
      quantity: 1,
    },
    {
      proposalNo: 'EST-26-003',
      clientRef: 'wayne',
      serviceRef: 'cloud',
      title: 'Gotham Data Center Migration',
      status: 'DRAFT',
      validDays: 14,
      quantity: 2,
    },
  ],
  invoices: [
    { clientRef: 'stark', daysAgo: -180, amount: 45000, description: 'Q3 System Architecture', status: 'PAID' },
    { clientRef: 'reliance', daysAgo: -150, amount: 85000, description: 'Frontend Redesign', status: 'PAID' },
    { clientRef: 'wayne', daysAgo: -120, amount: 35000, description: 'Security Audit', status: 'PAID' },
    { clientRef: 'stark', daysAgo: -90, amount: 45000, description: 'Q4 Cloud Infrastructure', status: 'PAID' },
    { clientRef: 'reliance', daysAgo: -60, amount: 45000, description: 'Performance Tuning', status: 'PAID' },
    { clientRef: 'wayne', daysAgo: -45, amount: 35000, description: 'AWS Migration', status: 'PAID' },
    { clientRef: 'wayne', daysAgo: -25, amount: 35000, description: 'Security Retainer', status: 'PENDING' },
    { clientRef: 'stark', daysAgo: -12, amount: 45000, description: 'Cloud Retainer', status: 'PENDING' },
    { clientRef: 'reliance', daysAgo: -3, amount: 15000, description: 'Maintenance Retainer', status: 'PENDING' },
  ],
  expenses: [
    { daysAgo: -100, category: 'Office & Rent', vendor: 'WeWork', amount: 25000, description: 'Monthly Desk Rent' },
    { daysAgo: -5, category: 'Meals', vendor: 'Swiggy', amount: 850, description: 'Client Lunch' },
  ],
  investments: [
    { daysAgo: -300, category: '80C', assetName: 'PPF Account', amount: 150000 },
    { daysAgo: -60, category: 'Mutual Funds', assetName: 'Index Fund', amount: 75000 },
  ],
  retainers: [
    {
      clientRef: 'wayne',
      serviceName: 'Security Monitoring',
      amount: 35000,
      frequency: 'MONTHLY',
      nextBillingInDays: 5,
      status: 'ACTIVE',
      autoAppendMonth: true,
      sacCode: '998313',
    },
    {
      clientRef: 'stark',
      serviceName: 'Cloud Infrastructure',
      amount: 45000,
      frequency: 'MONTHLY',
      nextBillingInDays: 18,
      status: 'ACTIVE',
      autoAppendMonth: true,
      sacCode: '998313',
    },
    {
      clientRef: 'reliance',
      serviceName: 'Maintenance',
      amount: 15000,
      frequency: 'MONTHLY',
      nextBillingInDays: 27,
      status: 'ACTIVE',
      autoAppendMonth: true,
      sacCode: '998313',
    },
  ],
  modules: {
    WORKFORCE: true,
    PAYROLL: true,
    DOCUMENTS: true,
    REVENUE_PIPELINE: true,
    CASH_FLOW: true,
    TAX_ADVANCED: true,
  },
  async seed({ tx, workspaceId, userId, now }) {
    // Payment behavior signal for receivables widgets
    const clients = await tx.client.findMany({ where: { workspaceId }, select: { id: true } });
    if (clients[0]) {
      await tx.clientPaymentBehavior.upsert({
        where: { clientId: clients[0].id },
        update: {
          avgDaysToPay: 41,
          medianDaysToPay: 36,
          onTimeRate: 0.62,
          lateRate: 0.31,
          partialPaymentRate: 0.12,
          sampleInvoicesCount: 14,
          lastComputedAt: now,
        },
        create: {
          workspaceId,
          clientId: clients[0].id,
          avgDaysToPay: 41,
          medianDaysToPay: 36,
          onTimeRate: 0.62,
          lateRate: 0.31,
          partialPaymentRate: 0.12,
          sampleInvoicesCount: 14,
          lastComputedAt: now,
        },
      });
    }

    // Cash forecast snapshots + manual adjustments for variance stories
    const horizon = 'WEEKLY_13' as const;
    const scenarios = [
      { tag: 'BASE' as const, risk: 'MEDIUM' as const, variance: 0.07, label: 'Base scenario' },
      { tag: 'BEST_CASE' as const, risk: 'LOW' as const, variance: -0.02, label: 'Best case' },
      { tag: 'WORST_CASE' as const, risk: 'HIGH' as const, variance: 0.14, label: 'Worst case' },
    ];

    for (const s of scenarios) {
      const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() + 13 * 7 * 24 * 60 * 60 * 1000);
      const snapshot = await tx.cashForecastSnapshot.create({
        data: {
          workspaceId,
          horizonType: horizon,
          scenarioTag: s.tag,
          generatedBy: 'SYSTEM',
          generatedAt: startDate,
          startDate,
          endDate,
          openingCash: 125000,
          closingCash: 142000,
          totalProjectedInflows: 210000,
          totalProjectedOutflows: 193000,
          assumptionsJson: { headline: s.label },
        },
        select: { id: true },
      });

      // A few periods to make risk/variance widgets non-empty.
      for (let i = 0; i < 4; i++) {
        const periodStart = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
        const periodEnd = new Date(now.getTime() + (i + 1) * 7 * 24 * 60 * 60 * 1000);
        await tx.cashForecastPeriod.create({
          data: {
            snapshotId: snapshot.id,
            periodStart,
            periodEnd,
            bucketLabel: `W${i + 1}`,
            openingCash: 125000 + i * 2500,
            projectedInflows: 50000 - i * 2000,
            projectedOutflows: 46000 + i * 1500,
            closingCash: 126000 + i * 3000,
            riskLevel: i === 3 ? s.risk : 'LOW',
            varianceFromPriorForecast: i === 3 ? s.variance : 0,
            notesJson: { note: `Seeded period for ${s.label}.` },
          },
        });
      }
    }

    await tx.cashForecastManualAdjustment.createMany({
      data: [
        {
          workspaceId,
          date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
          amount: 25000,
          direction: 'INFLOW',
          reason: 'Enterprise client upsell (expected)',
          category: 'Sales',
          createdBy: userId,
        },
        {
          workspaceId,
          date: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          amount: 12000,
          direction: 'OUTFLOW',
          reason: 'Campaign overspend buffer',
          category: 'Marketing',
          createdBy: userId,
        },
      ],
    });

    // Notifications to populate bell + attention cards
    await tx.inAppNotification.createMany({
      data: [
        {
          userId,
          workspaceId,
          eventType: 'PAYMENT_REMINDER',
          title: 'Overdue invoice follow-up',
          body: 'Stark Industries payment is overdue. Consider sending a reminder and updating follow-up status.',
          actionUrl: '/invoices',
        },
        {
          userId,
          workspaceId,
          eventType: 'DEADLINE_ALERT',
          title: 'Campaign spend alert',
          body: 'Google Ads spend for “Acme Launch” is tracking 12% above plan this week.',
          actionUrl: '/dashboard',
        },
      ],
    });
  },
};


import type { DemoTemplateDefinition } from "@/lib/demo/templates/types";

export const softwareCompanyTemplate: DemoTemplateDefinition = {
  key: "software_company",
  label: "Software Company",
  shortDescription: "Proposal-to-invoice milestones, service orders, workforce, and KPI history.",
  workspace: {
    name: "BabaBuilds Demo Enterprise",
    countryCode: "US",
    baseCurrency: "USD",
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
    isSetupComplete: true,
  },
  businessProfile: {
    companyName: "Northstar Software LLC",
    proprietorName: "Maya Thompson",
    address: "401 Mission Street, San Francisco, CA 94105",
    email: "billing@northstar.demo",
    phone: "+1 415 555 0189",
    website: "https://northstar.demo",
    panNumber: "US-TAX-44218",
    bankName: "Chase",
    accountName: "Northstar Software LLC",
    accountNumber: "987654321",
    ifscCode: "CHASUS33",
    taxLabel: "Sales Tax",
    taxIdLabel: "EIN",
    routingLabel: "ABA",
    defaultTaxRate: 8.25,
    defaultSacCode: "998314",
    groqApiKeyPlaintext: "gsk_demo_bypass_key_placeholder",
  },
  clients: [
    {
      ref: "atlas",
      name: "Atlas Freight",
      address: "Austin, TX",
      country: "USA",
      taxId: "US-EIN-112233",
      email: "ap@atlasfreight.com",
      isExport: false,
    },
    {
      ref: "lumina",
      name: "Lumina Health",
      address: "Seattle, WA",
      country: "USA",
      taxId: "US-EIN-778899",
      email: "finance@luminahealth.com",
      isExport: false,
    },
    {
      ref: "globalpay",
      name: "GlobalPay EU",
      address: "Dublin, IE",
      country: "Ireland",
      email: "payables@globalpay.eu",
      isExport: true,
    },
  ],
  services: [
    { ref: "platform", name: "SaaS Platform Engineering", defaultPrice: 24000, description: "Product squad for roadmap delivery." },
    { ref: "ml", name: "ML Feature Sprint", defaultPrice: 18000, description: "Applied AI feature implementation and launch." },
    { ref: "sre", name: "SRE Reliability Retainer", defaultPrice: 12000, description: "24/7 uptime monitoring and incident readiness." },
  ],
  proposals: [
    { proposalNo: "EST-26-101", clientRef: "atlas", serviceRef: "platform", title: "Freight Ops Platform", status: "SENT", validDays: 14, quantity: 1 },
    { proposalNo: "EST-26-102", clientRef: "lumina", serviceRef: "ml", title: "Patient Triage AI", status: "VIEWED", validDays: 10, quantity: 1 },
  ],
  invoices: [
    { clientRef: "atlas", daysAgo: -60, amount: 24000, description: "Q1 Roadmap Delivery", status: "PAID" },
    { clientRef: "lumina", daysAgo: -22, amount: 18000, description: "ML Feature Sprint", status: "PAID" },
    { clientRef: "globalpay", daysAgo: -6, amount: 12000, description: "Reliability Retainer", status: "PENDING" },
  ],
  expenses: [
    { daysAgo: -40, category: "Cloud", vendor: "AWS", amount: 7200, description: "Production infrastructure" },
    { daysAgo: -15, category: "Tools", vendor: "Linear", amount: 960, description: "Engineering seat subscriptions" },
  ],
  investments: [{ daysAgo: -130, category: "Treasury", assetName: "US T-Bills", amount: 20000 }],
  retainers: [
    {
      clientRef: "globalpay",
      serviceName: "SRE Reliability",
      amount: 12000,
      frequency: "MONTHLY",
      nextBillingInDays: 12,
      status: "ACTIVE",
      autoAppendMonth: true,
      sacCode: "998314",
    },
  ],
  modules: {
    WORKFORCE: true,
    PAYROLL: true,
    DOCUMENTS: true,
    REVENUE_PIPELINE: true,
    CASH_FLOW: true,
    TAX_ADVANCED: true,
    AR_COLLECTIONS: true,
    REPORTING_CENTER: true,
    IMPORT_MANAGER: true,
    SHOP: true,
    MIAB_BILLING: true,
  },
  seededModules: [
    "WORKFORCE",
    "PAYROLL",
    "DOCUMENTS",
    "REVENUE_PIPELINE",
    "CASH_FLOW",
    "AR_COLLECTIONS",
    "TAX_ADVANCED",
    "REPORTING_CENTER",
    "IMPORT_MANAGER",
    "SHOP",
    "MIAB_BILLING",
  ],
  seed: async ({ tx, workspaceId, userId, now }) => {
    const employee = await tx.employee.create({
      data: {
        workspaceId,
        firstName: "Ava",
        lastName: "Nguyen",
        email: "ava@northstar.demo",
        employeeCode: "EMP-001",
        joinDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 120),
        status: "ACTIVE",
        location: "San Francisco",
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const period = await tx.payrollPeriod.create({
      data: {
        workspaceId,
        startDate: periodStart,
        endDate: periodEnd,
        status: "OPEN",
      },
      select: { id: true },
    });

    const run = await tx.payrollRun.create({
      data: {
        workspaceId,
        periodId: period.id,
        version: 1,
        status: "APPROVED",
        totalEarnings: 8000,
        totalDeductions: 1200,
        totalEmployerCosts: 900,
        totalNetPay: 6800,
        generatedByUserId: userId,
        approvedAt: now,
        employeeSnapshots: {
          create: [
            {
              employeeId: employee.id,
              employeeCode: "EMP-001",
              firstName: employee.firstName,
              lastName: employee.lastName,
              email: employee.email,
              departmentName: "Engineering",
              designation: "Senior Engineer",
              location: "San Francisco",
              baseSalary: 8000,
            },
          ],
        },
      },
      select: { id: true },
    });

    // Minimal documents + OCR history
    const doc = await tx.document.create({
      data: {
        workspaceId,
        title: "Northstar - MSA - Atlas Freight.pdf",
        category: "CONTRACT",
        scope: "WORKSPACE_BUSINESS",
        status: "READY",
        source: "upload_center",
        uploadedByUserId: userId,
      },
      select: { id: true },
    });

    const file = await tx.documentFile.create({
      data: {
        workspaceId,
        documentId: doc.id,
        isCurrent: true,
        mimeType: "application/pdf",
        originalName: "MSA-Atlas-Freight.pdf",
        storedPath: `/documents/${workspaceId}/msa-atlas-freight.pdf`,
        byteSize: 245000,
        pageCount: 12,
      },
      select: { id: true },
    });

    await tx.documentOcrJob.create({
      data: {
        workspaceId,
        documentId: doc.id,
        documentFileId: file.id,
        kind: "GENERIC",
        status: "SUCCEEDED",
        provider: "UNCONFIGURED",
        attemptCount: 1,
        queuedAt: new Date(now.getTime() - 1000 * 60 * 20),
        startedAt: new Date(now.getTime() - 1000 * 60 * 19),
        finishedAt: new Date(now.getTime() - 1000 * 60 * 18),
      },
    });

    // Cash flow artifacts
    await tx.cashForecastSnapshot.create({
      data: {
        workspaceId,
        horizonType: "WEEKLY_13",
        scenarioTag: "BASE",
        generatedBy: "SYSTEM",
        generatedAt: now,
        startDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7),
        endDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7 * 12),
        openingCash: 25000,
        closingCash: 31200,
        totalProjectedInflows: 68000,
        totalProjectedOutflows: 61800,
        assumptionsJson: { note: "Seeded demo snapshot", runId: run.id },
      },
    });

    await tx.cashForecastManualAdjustment.create({
      data: {
        workspaceId,
        date: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
        direction: "OUTFLOW",
        amount: 6800,
        reason: "Payroll run (seeded) — net pay",
        category: "PAYROLL",
        createdBy: userId,
      },
    });

    // AR collections signal.
    const clients = await tx.client.findMany({ where: { workspaceId }, select: { id: true }, take: 1 });
    if (clients[0]) {
      await tx.clientPaymentBehavior.upsert({
        where: { clientId: clients[0].id },
        update: {
          avgDaysToPay: 24,
          medianDaysToPay: 21,
          onTimeRate: 0.74,
          lateRate: 0.22,
          partialPaymentRate: 0.08,
          sampleInvoicesCount: 11,
          lastComputedAt: now,
        },
        create: {
          workspaceId,
          clientId: clients[0].id,
          avgDaysToPay: 24,
          medianDaysToPay: 21,
          onTimeRate: 0.74,
          lateRate: 0.22,
          partialPaymentRate: 0.08,
          sampleInvoicesCount: 11,
          lastComputedAt: now,
        },
      });
    }

    // Tax Advanced demo workflow.
    const taxPeriod = await tx.taxPeriod.create({
      data: {
        workspaceId,
        countryCode: "IN",
        periodCode: `TDS-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        periodType: "MONTH",
        fiscalYear: `${now.getFullYear()}`,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10),
      },
      select: { id: true },
    });

    const taxForm = await tx.taxForm.create({
      data: {
        workspaceId,
        countryCode: "IN",
        returnFamily: "INDIA_TDS_QTR",
        formCode: "TDS-Q2",
        version: "1.0",
        title: "Quarterly TDS Return",
        isActive: true,
      },
      select: { id: true },
    });

    const taxReturn = await tx.taxReturn.create({
      data: {
        workspaceId,
        taxPeriodId: taxPeriod.id,
        taxFormId: taxForm.id,
        status: "DRAFT",
      },
      select: { id: true },
    });

    const readinessCheck = await tx.taxReadinessCheck.upsert({
      where: {
        workspaceId_returnFamily_checkCode: {
          workspaceId,
          returnFamily: "INDIA_TDS_QTR",
          checkCode: "MISSING_EXEMPTION_CERTS",
        },
      },
      update: { isActive: true },
      create: {
        workspaceId,
        countryCode: "IN",
        returnFamily: "INDIA_TDS_QTR",
        checkCode: "MISSING_EXEMPTION_CERTS",
        title: "Missing resale certificate evidence",
        description: "Attach exemption certificates for tax-exempt invoices before filing.",
        severity: "WARNING",
        isActive: true,
      },
      select: { id: true },
    });

    await tx.taxReadinessBlocker.create({
      data: {
        workspaceId,
        taxReturnId: taxReturn.id,
        checkId: readinessCheck.id,
        blockerCode: "CERTS_REQUIRED",
        title: "Resale certificates missing",
        details: "One or more exempt invoices are missing supporting exemption documents.",
        severity: "WARNING",
        status: "OPEN",
      },
    });

    await tx.inAppNotification.create({
      data: {
        userId,
        workspaceId,
        eventType: "TAX_ALERT",
        title: "Sales tax readiness warning",
        body: "An exemption-certificate blocker was detected in Tax Advanced.",
        actionUrl: "/tax/advanced",
      },
    });

    /** Public shop + inventory — brochure and demos need non-empty storefront and stock views */
    const shopSlug = `northstar-${workspaceId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-18)}`;
    await tx.businessProfile.update({
      where: { workspaceId },
      data: {
        shopSlug,
        shopEnabled: true,
        shopTagline: "Professional services and retainers — order securely online",
        shopAccentColor: "#ea580c",
        shopAnnouncement: "Demo storefront — pricing is illustrative.",
        shopAboutMd:
          "Northstar Software delivers platform engineering, applied ML, and reliability programs for teams worldwide.",
        shopFaqJson: JSON.stringify([
          {
            q: "How do I place an order?",
            a: "Browse the catalog and use checkout when a payment gateway is configured for this workspace.",
          },
        ]),
      },
    });

    const templates = await tx.serviceTemplate.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      take: 6,
    });
    for (let i = 0; i < templates.length; i++) {
      const svc = templates[i]!;
      await tx.product.create({
        data: {
          workspaceId,
          sku: `DEMO-INV-${String(i + 1).padStart(3, "0")}`,
          name: svc.name,
          description: svc.description ?? svc.name,
          baselinePrice: svc.defaultPrice,
          costPrice: 0,
          currentStock: 42 + i * 5,
          safetyStock: 5,
          status: "IN_STOCK",
          showInShop: true,
          shopSortOrder: i,
          shopDescription: `${svc.name} — listed for the public shop demo.`,
        },
      });
    }
  },
};

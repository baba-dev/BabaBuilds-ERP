import type { DemoTemplateDefinition } from "@/lib/demo/templates/types";

export const contractorBuilderTemplate: DemoTemplateDefinition = {
  key: "contractor_builder",
  label: "Contractor & Builder",
  shortDescription:
    "Milestone billing, vendor-heavy outflows, and project cash visibility for builders and contractors.",
  workspace: {
    name: "BabaBuilds Demo Enterprise",
    countryCode: "IN",
    baseCurrency: "INR",
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
  },
  businessProfile: {
    companyName: "SummitBuild Constructions Pvt Ltd",
    proprietorName: "Raghav Bansal",
    address: "Plot 19, Industrial Area Phase 2, Jaipur, RJ 302017",
    email: "billing@summitbuild.demo",
    phone: "+91 141 555 1010",
    website: "https://summitbuild.demo",
    panNumber: "AABCS9123L",
    udyamNumber: "UDYAM-RJ-11-0099110",
    gstin: "08AABCS9123L1ZV",
    bankName: "State Bank of India",
    accountName: "SummitBuild Constructions Pvt Ltd",
    accountNumber: "340019002112",
    ifscCode: "SBIN0001122",
    defaultSacCode: "9954",
    defaultTaxRate: 18,
    groqApiKeyPlaintext: "gsk_demo_bypass_key_placeholder",
  },
  clients: [
    {
      ref: "aurora",
      name: "Aurora Warehousing LLP",
      address: "Bhiwadi, Rajasthan",
      country: "India",
      email: "accounts@aurorawarehousing.in",
      taxId: "08AUROR1122M1ZX",
      isExport: false,
    },
    {
      ref: "zenstone",
      name: "Zenstone Realty",
      address: "Gurugram, Haryana",
      country: "India",
      email: "finance@zenstone.in",
      taxId: "06ZENST9911K1ZA",
      isExport: false,
    },
    {
      ref: "luma",
      name: "Luma Infra Tech",
      address: "Pune, Maharashtra",
      country: "India",
      email: "ap@lumainfra.in",
      taxId: "27LUMAA1100P1ZT",
      isExport: false,
    },
  ],
  services: [
    {
      ref: "civil_phase1",
      name: "Civil Work Milestone - Phase 1",
      defaultPrice: 450000,
      description: "Foundation, structural prep, and initial civil package.",
    },
    {
      ref: "interior_fitout",
      name: "Interior Fit-out Milestone",
      defaultPrice: 280000,
      description: "Electrical, carpentry, and interior execution package.",
    },
    {
      ref: "site_supervision",
      name: "Monthly Site Supervision",
      defaultPrice: 95000,
      description: "Progress reviews, manpower planning, and compliance checks.",
    },
  ],
  proposals: [
    {
      proposalNo: "EST-26-301",
      clientRef: "aurora",
      serviceRef: "civil_phase1",
      title: "Warehouse Civil Execution - Phase 1",
      status: "ACCEPTED",
      validDays: -5,
      quantity: 1,
    },
    {
      proposalNo: "EST-26-302",
      clientRef: "zenstone",
      serviceRef: "interior_fitout",
      title: "Zenstone Residential Fit-out",
      status: "SENT",
      validDays: 12,
      quantity: 1,
    },
  ],
  invoices: [
    {
      clientRef: "aurora",
      daysAgo: -42,
      amount: 450000,
      description: "Phase 1 Civil Work Milestone",
      status: "PAID",
    },
    {
      clientRef: "luma",
      daysAgo: -18,
      amount: 95000,
      description: "Monthly Site Supervision",
      status: "PENDING",
    },
    {
      clientRef: "zenstone",
      daysAgo: -7,
      amount: 280000,
      description: "Interior Fit-out Advance",
      status: "PENDING",
    },
  ],
  expenses: [
    {
      daysAgo: -25,
      category: "Materials",
      vendor: "Shakti Steel Suppliers",
      amount: 185000,
      description: "Structural steel procurement",
    },
    {
      daysAgo: -10,
      category: "Subcontractor",
      vendor: "Apex Electricals",
      amount: 72000,
      description: "Electrical subcontract labor payment",
    },
    {
      daysAgo: -4,
      category: "Transport",
      vendor: "City Haulage",
      amount: 21000,
      description: "Material transport and crane movement",
    },
  ],
  investments: [
    {
      daysAgo: -140,
      category: "Machinery",
      assetName: "Portable Concrete Mixer",
      amount: 165000,
    },
  ],
  retainers: [
    {
      clientRef: "luma",
      serviceName: "Site Supervision",
      amount: 95000,
      frequency: "MONTHLY",
      nextBillingInDays: 9,
      status: "ACTIVE",
      autoAppendMonth: true,
      sacCode: "9954",
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
  ],
  seed: async ({ tx, workspaceId, userId, now }) => {
    const department = await tx.department.create({
      data: { workspaceId, name: "Project Delivery" },
      select: { id: true },
    });
    const designation = await tx.designation.create({
      data: { workspaceId, title: "Site Engineer" },
      select: { id: true },
    });
    const employee = await tx.employee.create({
      data: {
        workspaceId,
        firstName: "Karan",
        lastName: "Sethi",
        email: "karan@summitbuild.demo",
        employeeCode: "EMP-CB-001",
        joinDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90),
        status: "ACTIVE",
        departmentId: department.id,
        designationId: designation.id,
        location: "Jaipur",
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    await tx.attendanceRecord.createMany({
      data: [
        {
          workspaceId,
          employeeId: employee.id,
          date: new Date(now.getTime() - 1000 * 60 * 60 * 24),
          status: "PRESENT",
        },
      ],
    });

    const payrollPeriod = await tx.payrollPeriod.create({
      data: {
        workspaceId,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        status: "OPEN",
      },
      select: { id: true },
    });

    await tx.payrollRun.create({
      data: {
        workspaceId,
        periodId: payrollPeriod.id,
        version: 1,
        status: "DRAFT",
        totalEarnings: 58000,
        totalDeductions: 4500,
        totalEmployerCosts: 2900,
        totalNetPay: 53500,
        generatedByUserId: userId,
      },
    });

    const document = await tx.document.create({
      data: {
        workspaceId,
        title: "Site Work Order - Aurora Warehouse.pdf",
        category: "CONTRACT",
        scope: "WORKSPACE_BUSINESS",
        status: "READY",
        source: "upload_center",
        uploadedByUserId: userId,
      },
      select: { id: true },
    });

    const documentFile = await tx.documentFile.create({
      data: {
        workspaceId,
        documentId: document.id,
        isCurrent: true,
        mimeType: "application/pdf",
        originalName: "aurora-site-work-order.pdf",
        storedPath: `/documents/${workspaceId}/aurora-site-work-order.pdf`,
        byteSize: 214000,
        pageCount: 11,
      },
      select: { id: true },
    });

    await tx.documentOcrJob.create({
      data: {
        workspaceId,
        documentId: document.id,
        documentFileId: documentFile.id,
        kind: "GENERIC",
        status: "SUCCEEDED",
        provider: "UNCONFIGURED",
        attemptCount: 1,
        queuedAt: new Date(now.getTime() - 1000 * 60 * 35),
        startedAt: new Date(now.getTime() - 1000 * 60 * 34),
        finishedAt: new Date(now.getTime() - 1000 * 60 * 33),
      },
    });

    const snapshot = await tx.cashForecastSnapshot.create({
      data: {
        workspaceId,
        horizonType: "WEEKLY_13",
        scenarioTag: "BASE",
        generatedBy: "SYSTEM",
        generatedAt: now,
        startDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7),
        endDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7 * 12),
        openingCash: 320000,
        closingCash: 355000,
        totalProjectedInflows: 980000,
        totalProjectedOutflows: 945000,
        assumptionsJson: { note: "Contractor base scenario snapshot" },
      },
      select: { id: true },
    });

    await tx.cashForecastPeriod.create({
      data: {
        snapshotId: snapshot.id,
        periodStart: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
        periodEnd: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14),
        bucketLabel: "W1",
        openingCash: 320000,
        projectedInflows: 210000,
        projectedOutflows: 192000,
        closingCash: 338000,
        riskLevel: "MEDIUM",
      },
    });

    await tx.cashForecastManualAdjustment.create({
      data: {
        workspaceId,
        date: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10),
        direction: "OUTFLOW",
        amount: 68000,
        reason: "Concrete supply batch payment",
        category: "MATERIALS",
        createdBy: userId,
      },
    });

    const clients = await tx.client.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 1,
    });
    if (clients[0]) {
      await tx.clientPaymentBehavior.upsert({
        where: { clientId: clients[0].id },
        update: {
          avgDaysToPay: 33,
          medianDaysToPay: 29,
          onTimeRate: 0.66,
          lateRate: 0.28,
          partialPaymentRate: 0.14,
          sampleInvoicesCount: 10,
          lastComputedAt: now,
        },
        create: {
          workspaceId,
          clientId: clients[0].id,
          avgDaysToPay: 33,
          medianDaysToPay: 29,
          onTimeRate: 0.66,
          lateRate: 0.28,
          partialPaymentRate: 0.14,
          sampleInvoicesCount: 10,
          lastComputedAt: now,
        },
      });
    }

    await tx.inAppNotification.createMany({
      data: [
        {
          userId,
          workspaceId,
          eventType: "DEADLINE_ALERT",
          title: "Milestone billing due this week",
          body: "Phase 2 billing for Aurora project is due in 4 days.",
          actionUrl: "/invoice",
        },
      ],
    });
  },
};

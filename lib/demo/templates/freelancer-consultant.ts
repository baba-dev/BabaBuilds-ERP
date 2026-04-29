import type { DemoTemplateDefinition } from "@/lib/demo/templates/types";

export const freelancerConsultantTemplate: DemoTemplateDefinition = {
  key: "freelancer_consultant",
  label: "Freelancer & Consultant",
  shortDescription:
    "Solo-operator setup with proposals, recurring retainers, and tax-ready bookkeeping.",
  workspace: {
    name: "BabaBuilds Demo Enterprise",
    countryCode: "IN",
    baseCurrency: "INR",
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
  },
  businessProfile: {
    companyName: "Aarav Consulting Studio",
    proprietorName: "Aarav Khanna",
    address: "22, Koramangala 5th Block, Bengaluru, KA 560095",
    email: "billing@aaravconsulting.demo",
    phone: "+91 98 7654 2121",
    website: "https://aaravconsulting.demo",
    panNumber: "AAAPK1234M",
    gstin: "29AAAPK1234M1Z7",
    udyamNumber: "UDYAM-KR-07-4561230",
    bankName: "HDFC Bank Ltd.",
    accountName: "Aarav Consulting Studio",
    accountNumber: "50200099887766",
    ifscCode: "HDFC0000876",
    defaultSacCode: "998312",
    defaultTaxRate: 18,
    groqApiKeyPlaintext: "gsk_demo_bypass_key_placeholder",
  },
  clients: [
    {
      ref: "finedge",
      name: "FinEdge Analytics",
      address: "Pune, India",
      country: "India",
      email: "accounts@finedge.in",
      taxId: "27FINED1234L1Z8",
      isExport: false,
    },
    {
      ref: "nordic",
      name: "Nordic Product Labs",
      address: "Stockholm, Sweden",
      country: "Sweden",
      email: "finance@nordiclabs.se",
      isExport: true,
    },
    {
      ref: "orbit",
      name: "Orbit Health Co",
      address: "Dubai, UAE",
      country: "UAE",
      email: "payables@orbithealth.ae",
      isExport: true,
    },
  ],
  services: [
    {
      ref: "strategy",
      name: "Growth Strategy Sprint",
      defaultPrice: 60000,
      description: "Two-week strategy and execution roadmap for growth initiatives.",
    },
    {
      ref: "retainer",
      name: "Monthly Product Advisory Retainer",
      defaultPrice: 45000,
      description: "Ongoing product and go-to-market advisory support.",
    },
    {
      ref: "audit",
      name: "Revenue Funnel Audit",
      defaultPrice: 35000,
      description: "End-to-end audit of acquisition and retention funnel economics.",
    },
  ],
  proposals: [
    {
      proposalNo: "EST-26-501",
      clientRef: "finedge",
      serviceRef: "retainer",
      title: "Q3 Product Advisory Retainer",
      status: "ACCEPTED",
      validDays: -3,
      quantity: 1,
    },
    {
      proposalNo: "EST-26-502",
      clientRef: "orbit",
      serviceRef: "strategy",
      title: "Market Expansion Strategy Sprint",
      status: "SENT",
      validDays: 9,
      quantity: 1,
    },
  ],
  invoices: [
    {
      clientRef: "finedge",
      daysAgo: -40,
      amount: 45000,
      description: "Monthly Product Advisory Retainer",
      status: "PAID",
    },
    {
      clientRef: "nordic",
      daysAgo: -14,
      amount: 35000,
      description: "Revenue Funnel Audit",
      status: "PAID",
    },
    {
      clientRef: "orbit",
      daysAgo: -4,
      amount: 60000,
      description: "Growth Strategy Sprint",
      status: "PENDING",
    },
  ],
  expenses: [
    {
      daysAgo: -20,
      category: "Software",
      vendor: "Notion",
      amount: 1200,
      description: "Workspace plan",
    },
    {
      daysAgo: -6,
      category: "Travel",
      vendor: "Ola",
      amount: 640,
      description: "Client meeting commute",
    },
  ],
  investments: [
    {
      daysAgo: -160,
      category: "Mutual Funds",
      assetName: "Index Growth Fund",
      amount: 80000,
    },
  ],
  retainers: [
    {
      clientRef: "finedge",
      serviceName: "Product Advisory",
      amount: 45000,
      frequency: "MONTHLY",
      nextBillingInDays: 8,
      status: "ACTIVE",
      autoAppendMonth: true,
      sacCode: "998312",
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
  ],
  seed: async ({ tx, workspaceId, userId, now }) => {
    const dept = await tx.department.create({
      data: { workspaceId, name: "Client Success" },
      select: { id: true },
    });
    const desg = await tx.designation.create({
      data: { workspaceId, title: "Operations Assistant" },
      select: { id: true },
    });
    const employee = await tx.employee.create({
      data: {
        workspaceId,
        firstName: "Mira",
        lastName: "Patel",
        email: "mira@aaravconsulting.demo",
        employeeCode: "EMP-FR-001",
        joinDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 95),
        departmentId: dept.id,
        designationId: desg.id,
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    await tx.attendanceRecord.create({
      data: {
        workspaceId,
        employeeId: employee.id,
        date: new Date(now.getTime() - 1000 * 60 * 60 * 24),
        status: "PRESENT",
      },
    });

    const period = await tx.payrollPeriod.create({
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
        periodId: period.id,
        version: 1,
        status: "DRAFT",
        generatedByUserId: userId,
        totalEarnings: 42000,
        totalDeductions: 5000,
        totalEmployerCosts: 2500,
        totalNetPay: 37000,
        employeeSnapshots: {
          create: [
            {
              employeeId: employee.id,
              employeeCode: "EMP-FR-001",
              firstName: employee.firstName,
              lastName: employee.lastName,
              email: employee.email,
              departmentName: "Client Success",
              designation: "Operations Assistant",
              baseSalary: 42000,
            },
          ],
        },
      },
    });

    const document = await tx.document.create({
      data: {
        workspaceId,
        title: "Consulting MSA - FinEdge.pdf",
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
        originalName: "consulting-msa-finedge.pdf",
        storedPath: `/documents/${workspaceId}/consulting-msa-finedge.pdf`,
        byteSize: 154000,
        pageCount: 6,
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
        queuedAt: new Date(now.getTime() - 1000 * 60 * 18),
        startedAt: new Date(now.getTime() - 1000 * 60 * 17),
        finishedAt: new Date(now.getTime() - 1000 * 60 * 15),
      },
    });

    await tx.cashForecastSnapshot.create({
      data: {
        workspaceId,
        horizonType: "WEEKLY_13",
        scenarioTag: "BASE",
        generatedBy: "SYSTEM",
        generatedAt: now,
        startDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14),
        endDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 70),
        openingCash: 90000,
        closingCash: 114000,
        totalProjectedInflows: 210000,
        totalProjectedOutflows: 186000,
        assumptionsJson: {
          drivers: ["retainers", "one-time strategy sprints", "software subscriptions"],
        },
      },
    });

    await tx.cashForecastManualAdjustment.create({
      data: {
        workspaceId,
        date: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 10),
        direction: "INFLOW",
        amount: 45000,
        reason: "Retainer renewal",
        category: "REVENUE",
        createdBy: userId,
      },
    });

    const client = await tx.client.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 1,
    });
    if (client[0]) {
      await tx.clientPaymentBehavior.upsert({
        where: { clientId: client[0].id },
        update: {
          avgDaysToPay: 17,
          medianDaysToPay: 14,
          onTimeRate: 0.82,
          lateRate: 0.12,
          partialPaymentRate: 0.06,
          sampleInvoicesCount: 10,
          lastComputedAt: now,
        },
        create: {
          workspaceId,
          clientId: client[0].id,
          avgDaysToPay: 17,
          medianDaysToPay: 14,
          onTimeRate: 0.82,
          lateRate: 0.12,
          partialPaymentRate: 0.06,
          sampleInvoicesCount: 10,
          lastComputedAt: now,
        },
      });
    }

    const taxPeriod = await tx.taxPeriod.create({
      data: {
        workspaceId,
        countryCode: "IN",
        periodCode: `GST-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        periodType: "MONTH",
        fiscalYear: `${now.getFullYear()}`,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 6),
      },
      select: { id: true },
    });
    const taxForm = await tx.taxForm.create({
      data: {
        workspaceId,
        countryCode: "IN",
        returnFamily: "INDIA_TDS_QTR",
        formCode: "TDS-Q4",
        version: "1.0",
        title: "Quarterly TDS Return",
        isActive: true,
      },
      select: { id: true },
    });
    await tx.taxReturn.create({
      data: {
        workspaceId,
        taxPeriodId: taxPeriod.id,
        taxFormId: taxForm.id,
        status: "DRAFT",
      },
    });

    await tx.inAppNotification.create({
      data: {
        userId,
        workspaceId,
        eventType: "PAYMENT_REMINDER",
        title: "Retainer invoice coming due",
        body: "FinEdge retainer renewal is due in 8 days. Queue next-cycle invoice.",
        actionUrl: "/retainers",
      },
    });
  },
};

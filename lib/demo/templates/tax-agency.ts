import type { DemoTemplateDefinition } from '@/lib/demo/templates/types';

export const taxAgencyTemplate: DemoTemplateDefinition = {
  key: 'tax_agency',
  label: 'Tax Agency',
  shortDescription: 'Compliance desk with document ingestion, governance trails, and operational KPIs.',
  workspace: {
    name: 'BabaBuilds Demo Enterprise',
    countryCode: 'IN',
    baseCurrency: 'INR',
    planTier: 'PRO',
    subscriptionStatus: 'ACTIVE',
  },
  businessProfile: {
    companyName: 'Sapphire Tax Desk LLP',
    proprietorName: 'Rohit Mehra',
    address: '19/A, Law Garden Road, Ahmedabad, GJ 380006',
    email: 'billing@sapphiretax.demo',
    phone: '+91 79 5555 0101',
    website: 'https://sapphiretax.demo',
    panNumber: 'AADCS1234K',
    bankName: 'ICICI Bank',
    accountName: 'Sapphire Tax Desk LLP',
    accountNumber: '112233445566',
    ifscCode: 'ICIC0000101',
    taxLabel: 'GST',
    taxIdLabel: 'GSTIN',
    routingLabel: 'IFSC',
    defaultTaxRate: 18,
    defaultSacCode: '998212',
    groqApiKeyPlaintext: 'gsk_demo_bypass_key_placeholder',
  },
  clients: [
    { ref: 'surya', name: 'Surya Exports', address: 'Ahmedabad, Gujarat', country: 'India', taxId: '24SURYA1234F1Z7', email: 'accounts@suryaexports.in', isExport: true },
    { ref: 'verdant', name: 'Verdant Foods Pvt Ltd', address: 'Pune, Maharashtra', country: 'India', taxId: '27VERDA4567L1Z2', email: 'payables@verdantfoods.in', isExport: false },
    { ref: 'ion', name: 'Ion Mobility', address: 'Bengaluru, Karnataka', country: 'India', taxId: '29IONMB7788R1Z9', email: 'finance@ionmobility.in', isExport: false },
  ],
  services: [
    { ref: 'gst', name: 'GST Filing & Reconciliation', defaultPrice: 25000, description: 'Monthly GST filing and mismatch resolution.' },
    { ref: 'tds', name: 'TDS Compliance Desk', defaultPrice: 18000, description: 'Quarterly filing and challan workflows.' },
    { ref: 'audit', name: 'Tax Litigation Support', defaultPrice: 40000, description: 'Notices, hearings, and response management.' },
  ],
  proposals: [
    { proposalNo: 'EST-26-201', clientRef: 'verdant', serviceRef: 'gst', title: 'FY26 GST Managed Services', status: 'ACCEPTED', validDays: -2, quantity: 1 },
    { proposalNo: 'EST-26-202', clientRef: 'ion', serviceRef: 'tds', title: 'Quarterly TDS Outsourcing', status: 'SENT', validDays: 10, quantity: 1 },
  ],
  invoices: [
    { clientRef: 'verdant', daysAgo: -75, amount: 25000, description: 'GST Filing Retainer', status: 'PAID' },
    { clientRef: 'ion', daysAgo: -28, amount: 18000, description: 'TDS Compliance Cycle', status: 'PENDING' },
    { clientRef: 'surya', daysAgo: -11, amount: 40000, description: 'Litigation Support', status: 'PENDING' },
  ],
  expenses: [
    { daysAgo: -25, category: 'Professional', vendor: 'Counsel Partners', amount: 12000, description: 'External legal review' },
    { daysAgo: -8, category: 'Travel', vendor: 'Uber Business', amount: 3200, description: 'Client hearing visit' },
  ],
  investments: [{ daysAgo: -150, category: '80C', assetName: 'Tax Saver ELSS', amount: 120000 }],
  retainers: [
    { clientRef: 'verdant', serviceName: 'GST Filing', amount: 25000, frequency: 'MONTHLY', nextBillingInDays: 6, status: 'ACTIVE', autoAppendMonth: true, sacCode: '998212' },
    { clientRef: 'ion', serviceName: 'TDS Desk', amount: 18000, frequency: 'MONTHLY', nextBillingInDays: 14, status: 'ACTIVE', autoAppendMonth: true, sacCode: '998212' },
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
    'WORKFORCE',
    'PAYROLL',
    'DOCUMENTS',
    'REVENUE_PIPELINE',
    'CASH_FLOW',
    'AR_COLLECTIONS',
    'TAX_ADVANCED',
    'REPORTING_CENTER',
    'IMPORT_MANAGER',
    'SHOP',
    'MIAB_BILLING',
  ],
  seed: async ({ tx, workspaceId, userId, now }) => {
    const [surya, verdant, ion] = await tx.client.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      take: 3,
      select: { id: true, name: true },
    });

    // Document vault story: a few documents with files, OCR jobs, and audit events.
    const doc1 = await tx.document.create({
      data: {
        workspaceId,
        title: 'GSTR-2B April 2026',
        category: 'GST',
        scope: 'COMPLIANCE',
        status: 'READY',
        source: 'upload_center',
        uploadedByUserId: userId,
      },
      select: { id: true },
    });
    const file1 = await tx.documentFile.create({
      data: {
        documentId: doc1.id,
        workspaceId,
        mimeType: 'application/pdf',
        originalName: 'gstr-2b-apr-2026.pdf',
        storedPath: `/documents/${workspaceId}/gstr-2b-apr-2026.pdf`,
        byteSize: 245_120,
        isCurrent: true,
        pageCount: 6,
      },
      select: { id: true },
    });
    await tx.documentOcrJob.create({
      data: {
        workspaceId,
        documentId: doc1.id,
        documentFileId: file1.id,
        kind: 'TAX',
        status: 'SUCCEEDED',
        provider: 'UNCONFIGURED',
        attemptCount: 1,
        queuedAt: new Date(now.getTime() - 1000 * 60 * 15),
        startedAt: new Date(now.getTime() - 1000 * 60 * 10),
        finishedAt: new Date(now.getTime() - 1000 * 60 * 8),
      },
    });
    await tx.documentAuditEvent.createMany({
      data: [
        {
          workspaceId,
          documentId: doc1.id,
          documentFileId: file1.id,
          eventType: 'UPLOAD',
          metadata: { message: 'Uploaded via Upload Center' },
          actorUserId: userId,
          createdAt: new Date(now.getTime() - 1000 * 60 * 20),
        },
        {
          workspaceId,
          documentId: doc1.id,
          documentFileId: file1.id,
          eventType: 'OCR_SUCCEEDED',
          metadata: { message: 'Extraction completed' },
          actorUserId: userId,
          createdAt: new Date(now.getTime() - 1000 * 60 * 8),
        },
      ],
    });

    // Tax advanced story: a readiness check + blocker linked to a TaxReturn.
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodYear = previousMonthDate.getFullYear();
    const periodMonth = previousMonthDate.getMonth();
    const start = new Date(periodYear, periodMonth, 1);
    const end = new Date(periodYear, periodMonth + 1, 0);
    const taxPeriod = await tx.taxPeriod.create({
      data: {
        workspaceId,
        countryCode: 'IN',
        periodCode: `TDS-${periodYear}-${String(periodMonth + 1).padStart(2, '0')}`,
        periodType: 'MONTH',
        fiscalYear: `${now.getFullYear()}`,
        startDate: start,
        endDate: end,
        dueDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7),
      },
      select: { id: true },
    });

    const taxForm = await tx.taxForm.create({
      data: {
        workspaceId,
        countryCode: 'IN',
        returnFamily: 'INDIA_TDS_QTR',
        formCode: 'TDS-Q1',
        version: '1.0',
        title: 'Quarterly TDS Return',
        isActive: true,
      },
      select: { id: true },
    });

    const returnDue = await tx.taxReturn.create({
      data: {
        workspaceId,
        taxPeriodId: taxPeriod.id,
        taxFormId: taxForm.id,
        status: 'DRAFT',
      },
      select: { id: true },
    });
    const check = await tx.taxReadinessCheck.upsert({
      where: { workspaceId_returnFamily_checkCode: { workspaceId, returnFamily: 'INDIA_TDS_QTR', checkCode: 'MISSING_FORM16A' } },
      update: { isActive: true },
      create: {
        workspaceId,
        countryCode: 'IN',
        returnFamily: 'INDIA_TDS_QTR',
        checkCode: 'MISSING_FORM16A',
        title: 'Missing Form 16A attachments',
        description: 'Attach Form 16A for all deductees before filing.',
        severity: 'WARNING',
        isActive: true,
      },
      select: { id: true },
    });
    await tx.taxReadinessBlocker.create({
      data: {
        workspaceId,
        taxReturnId: returnDue.id,
        checkId: check.id,
        blockerCode: 'FORM16A_REQUIRED',
        title: 'Form 16A missing for one or more deductees',
        details: 'Upload missing certificates to clear filing readiness.',
        severity: 'WARNING',
        status: 'OPEN',
        factsJson: {
          missingCount: 2,
          clients: [verdant?.name ?? 'Client A', ion?.name ?? 'Client B'],
        },
      },
    });

    // Notifications for sales demo surfaces.
    await tx.inAppNotification.createMany({
      data: [
        {
          userId,
          workspaceId,
          eventType: 'TAX_ALERT',
          title: 'TDS filing readiness blocked',
          body: 'A readiness blocker is preventing submission. Review missing attachments.',
          actionUrl: '/tax/advanced',
          createdAt: new Date(now.getTime() - 1000 * 60 * 35),
        },
        {
          userId,
          workspaceId,
          eventType: 'DEADLINE_ALERT',
          title: 'Upcoming compliance deadline',
          body: 'Quarterly TDS due in 7 days. Allocate reviewer bandwidth.',
          actionUrl: '/tax',
          createdAt: new Date(now.getTime() - 1000 * 60 * 60),
        },
      ],
    });

    // Cash-flow snapshot to keep cash widgets non-empty.
    await tx.cashForecastSnapshot.create({
      data: {
        workspaceId,
        horizonType: 'WEEKLY_13',
        scenarioTag: 'BASE',
        generatedBy: 'SYSTEM',
        generatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 2),
        assumptionsJson: {
          currency: 'INR',
          notes: 'Demo snapshot for variance widgets.',
          keyDrivers: ['pending invoices', 'monthly retainers', 'travel spend'],
        },
        startDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 14),
        endDate: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 84),
        openingCash: 150000,
        closingCash: 210000,
        totalProjectedInflows: 430000,
        totalProjectedOutflows: 370000,
      },
    });

    // Create a couple of employees + attendance to populate Workforce screens.
    const dept = await tx.department.create({ data: { workspaceId, name: 'Compliance Ops' }, select: { id: true } });
    const desg = await tx.designation.create({ data: { workspaceId, title: 'Tax Associate' }, select: { id: true } });
    const e1 = await tx.employee.create({
      data: {
        workspaceId,
        firstName: 'Ananya',
        lastName: 'Kapoor',
        email: 'ananya@sapphiretax.demo',
        employeeCode: 'EMP-001',
        joinDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 120),
        departmentId: dept.id,
        designationId: desg.id,
      },
      select: { id: true },
    });
    const e2 = await tx.employee.create({
      data: {
        workspaceId,
        firstName: 'Vikram',
        lastName: 'Singh',
        email: 'vikram@sapphiretax.demo',
        employeeCode: 'EMP-002',
        joinDate: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 80),
        departmentId: dept.id,
        designationId: desg.id,
        managerId: e1.id,
      },
      select: { id: true },
    });
    await tx.attendanceRecord.createMany({
      data: [
        { workspaceId, employeeId: e1.id, date: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1), status: 'PRESENT' },
        { workspaceId, employeeId: e2.id, date: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1), status: 'PRESENT' },
      ],
    });

    // Payroll: create an open period + draft run to make payroll UI non-empty.
    const period = await tx.payrollPeriod.create({
      data: {
        workspaceId,
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        status: 'OPEN',
      },
      select: { id: true },
    });
    await tx.payrollRun.create({
      data: {
        workspaceId,
        periodId: period.id,
        version: 1,
        status: 'DRAFT',
        generatedByUserId: userId,
        totalEarnings: 120000,
        totalDeductions: 12000,
        totalEmployerCosts: 8000,
        totalNetPay: 108000,
      },
    });

    // AR Collections signal.
    if (surya?.id) {
      await tx.clientPaymentBehavior.upsert({
        where: { clientId: surya.id },
        update: {
          avgDaysToPay: 39,
          medianDaysToPay: 34,
          onTimeRate: 0.58,
          lateRate: 0.35,
          partialPaymentRate: 0.18,
          sampleInvoicesCount: 9,
          lastComputedAt: now,
        },
        create: {
          workspaceId,
          clientId: surya.id,
          avgDaysToPay: 39,
          medianDaysToPay: 34,
          onTimeRate: 0.58,
          lateRate: 0.35,
          partialPaymentRate: 0.18,
          sampleInvoicesCount: 9,
          lastComputedAt: now,
        },
      });
    }

  },
};

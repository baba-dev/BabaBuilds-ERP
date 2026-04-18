export const TAX_RETURN_STATUSES = ['DRAFT', 'BLOCKED', 'READY', 'FILED'] as const;

export type TaxReturnStatus = (typeof TAX_RETURN_STATUSES)[number];

export type TaxAgencyTemplate = {
  id: 'tax_agency';
  label: string;
  narrative: string;
  clients: Array<{
    clientId: string;
    clientName: string;
    obligations: Array<{
      obligationId: string;
      taxType: string;
      jurisdiction: string;
      period: string;
      dueDate: string;
      status: TaxReturnStatus;
      blockers: string[];
      preparer: string;
      reviewer?: string;
      filedAt?: string;
    }>;
  }>;
  documentVault: {
    folders: string[];
    documents: Array<{
      documentId: string;
      clientId: string;
      period: string;
      category: string;
      title: string;
      source: 'UPLOAD' | 'EMAIL_IMPORT' | 'SFTP_IMPORT';
      ocrStatus: 'QUEUED' | 'COMPLETED' | 'FAILED' | 'REVIEW_REQUIRED';
      ocrConfidence?: number;
      tags: string[];
      linkedObligationIds: string[];
      createdAt: string;
    }>;
    importEvents: Array<{
      eventId: string;
      eventType: 'OCR_ENQUEUED' | 'OCR_COMPLETED' | 'IMPORT_MATCHED' | 'IMPORT_FAILED' | 'MANUAL_REVIEW';
      documentId: string;
      actor: string;
      detail: string;
      occurredAt: string;
    }>;
    auditLogs: Array<{
      logId: string;
      action: string;
      actor: string;
      entityType: 'DOCUMENT' | 'OBLIGATION' | 'RETURN' | 'WORKFLOW';
      entityId: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      timestamp: string;
    }>;
  };
  governance: {
    overrides: Array<{
      overrideId: string;
      obligationId: string;
      requestedBy: string;
      approvedBy?: string;
      reason: string;
      field: string;
      oldValue: string;
      newValue: string;
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      requestedAt: string;
      decidedAt?: string;
    }>;
    decisions: Array<{
      decisionId: string;
      obligationId: string;
      decisionType: 'RISK_ACCEPTANCE' | 'BLOCKER_ESCALATION' | 'FILING_APPROVAL';
      summary: string;
      owner: string;
      participants: string[];
      outcome: string;
      evidenceRefs: string[];
      occurredAt: string;
    }>;
  };
  adminDashboardStory: {
    overview: string;
    kpis: {
      upcomingDeadlines7d: number;
      blockedReturns: number;
      medianBlockerAgeDays: number;
      filingsCompleted30d: number;
      onTimeFilingRate: number;
    };
    deadlineQueue: Array<{
      obligationId: string;
      clientName: string;
      period: string;
      dueDate: string;
      daysRemaining: number;
      status: TaxReturnStatus;
    }>;
    blockerAging: Array<{
      blocker: string;
      openCount: number;
      p50AgeDays: number;
      p90AgeDays: number;
      owner: string;
    }>;
    filingThroughput: Array<{
      weekStart: string;
      filedCount: number;
      readyCount: number;
      blockedCount: number;
    }>;
  };
};

export const taxAgencyTemplate: TaxAgencyTemplate = {
  id: 'tax_agency',
  label: 'Tax agency operations',
  narrative:
    'A regulator-grade, multi-client tax desk scenario with realistic lifecycle states, intake controls, and governance checkpoints.',
  clients: [
    {
      clientId: 'client-nova-retail',
      clientName: 'Nova Retail Group',
      obligations: [
        {
          obligationId: 'obl-nova-vat-2026q1',
          taxType: 'VAT',
          jurisdiction: 'US-CA',
          period: '2026-Q1',
          dueDate: '2026-04-30',
          status: 'READY',
          blockers: [],
          preparer: 'A. Morales',
          reviewer: 'L. Chen',
        },
        {
          obligationId: 'obl-nova-payroll-mar',
          taxType: 'Payroll withholding',
          jurisdiction: 'US-CA',
          period: '2026-03',
          dueDate: '2026-04-20',
          status: 'BLOCKED',
          blockers: ['Missing signed officer declaration', 'Unreconciled fringe benefit ledger variance'],
          preparer: 'R. Gupta',
        },
      ],
    },
    {
      clientId: 'client-orbit-logistics',
      clientName: 'Orbit Logistics LLC',
      obligations: [
        {
          obligationId: 'obl-orbit-cit-2025',
          taxType: 'Corporate income tax',
          jurisdiction: 'US-FED',
          period: '2025-ANNUAL',
          dueDate: '2026-04-15',
          status: 'FILED',
          blockers: [],
          preparer: 'T. Jackson',
          reviewer: 'P. Singh',
          filedAt: '2026-04-14T18:23:00Z',
        },
        {
          obligationId: 'obl-orbit-sales-2026q1',
          taxType: 'Sales tax',
          jurisdiction: 'US-TX',
          period: '2026-Q1',
          dueDate: '2026-04-25',
          status: 'DRAFT',
          blockers: ['Draft not yet submitted for review'],
          preparer: 'D. Patel',
        },
      ],
    },
  ],
  documentVault: {
    folders: ['Incoming Statements', 'Filed Returns', 'Workpapers', 'Authority Notices'],
    documents: [
      {
        documentId: 'doc-1001',
        clientId: 'client-nova-retail',
        period: '2026-Q1',
        category: 'VAT Input Ledger',
        title: 'Nova Q1 Input Tax Register',
        source: 'SFTP_IMPORT',
        ocrStatus: 'COMPLETED',
        ocrConfidence: 0.96,
        tags: ['vat', 'source-ledger', 'high-confidence'],
        linkedObligationIds: ['obl-nova-vat-2026q1'],
        createdAt: '2026-04-02T09:00:00Z',
      },
      {
        documentId: 'doc-1044',
        clientId: 'client-nova-retail',
        period: '2026-03',
        category: 'Officer Attestation',
        title: 'Payroll Officer Declaration - March',
        source: 'EMAIL_IMPORT',
        ocrStatus: 'REVIEW_REQUIRED',
        ocrConfidence: 0.71,
        tags: ['payroll', 'signature-needed'],
        linkedObligationIds: ['obl-nova-payroll-mar'],
        createdAt: '2026-04-11T15:31:00Z',
      },
      {
        documentId: 'doc-1107',
        clientId: 'client-orbit-logistics',
        period: '2025-ANNUAL',
        category: 'Filed Return Receipt',
        title: 'IRS Acceptance Receipt - 2025',
        source: 'UPLOAD',
        ocrStatus: 'COMPLETED',
        ocrConfidence: 0.99,
        tags: ['filed', 'receipt', 'irs'],
        linkedObligationIds: ['obl-orbit-cit-2025'],
        createdAt: '2026-04-14T18:29:00Z',
      },
    ],
    importEvents: [
      {
        eventId: 'evt-ocr-1',
        eventType: 'OCR_ENQUEUED',
        documentId: 'doc-1044',
        actor: 'system/ingest',
        detail: 'Email attachment routed to OCR queue with payroll classifier.',
        occurredAt: '2026-04-11T15:31:08Z',
      },
      {
        eventId: 'evt-ocr-2',
        eventType: 'OCR_COMPLETED',
        documentId: 'doc-1044',
        actor: 'system/ocr',
        detail: 'Low confidence on officer signature field; escalation required.',
        occurredAt: '2026-04-11T15:32:16Z',
      },
      {
        eventId: 'evt-import-3',
        eventType: 'MANUAL_REVIEW',
        documentId: 'doc-1044',
        actor: 'ops/intake-01',
        detail: 'Tagged signature gap and created blocker on payroll obligation.',
        occurredAt: '2026-04-11T15:41:27Z',
      },
    ],
    auditLogs: [
      {
        logId: 'audit-501',
        action: 'DOCUMENT_TAG_UPDATED',
        actor: 'ops/intake-01',
        entityType: 'DOCUMENT',
        entityId: 'doc-1044',
        before: { tags: ['payroll'] },
        after: { tags: ['payroll', 'signature-needed'] },
        timestamp: '2026-04-11T15:42:00Z',
      },
      {
        logId: 'audit-522',
        action: 'RETURN_STATUS_CHANGED',
        actor: 'workflow/rules-engine',
        entityType: 'RETURN',
        entityId: 'obl-nova-payroll-mar',
        before: { status: 'DRAFT' },
        after: { status: 'BLOCKED' },
        timestamp: '2026-04-11T15:42:03Z',
      },
      {
        logId: 'audit-548',
        action: 'FILING_RECEIPT_LINKED',
        actor: 'tax/reviewer-02',
        entityType: 'RETURN',
        entityId: 'obl-orbit-cit-2025',
        before: { receiptLinked: false },
        after: { receiptLinked: true },
        timestamp: '2026-04-14T18:31:40Z',
      },
    ],
  },
  governance: {
    overrides: [
      {
        overrideId: 'ovr-001',
        obligationId: 'obl-nova-vat-2026q1',
        requestedBy: 'R. Gupta',
        approvedBy: 'L. Chen',
        reason: 'Materiality threshold policy allows rounding correction under $250.',
        field: 'netPayableTax',
        oldValue: '182341.12',
        newValue: '182175.90',
        status: 'APPROVED',
        requestedAt: '2026-04-09T10:01:00Z',
        decidedAt: '2026-04-09T11:12:00Z',
      },
      {
        overrideId: 'ovr-004',
        obligationId: 'obl-orbit-sales-2026q1',
        requestedBy: 'D. Patel',
        reason: 'Nexus classification dispute pending legal memo.',
        field: 'jurisdictionScope',
        oldValue: 'US-TX,US-NM',
        newValue: 'US-TX',
        status: 'PENDING',
        requestedAt: '2026-04-16T08:45:00Z',
      },
    ],
    decisions: [
      {
        decisionId: 'dec-101',
        obligationId: 'obl-nova-payroll-mar',
        decisionType: 'BLOCKER_ESCALATION',
        summary: 'Escalated missing declaration blocker due to aging > 5 days.',
        owner: 'Tax Ops Manager',
        participants: ['ops/intake-01', 'tax/reviewer-02', 'client-controller'],
        outcome: 'Client controller committed signed declaration by 2026-04-19.',
        evidenceRefs: ['doc-1044', 'audit-522'],
        occurredAt: '2026-04-17T09:30:00Z',
      },
      {
        decisionId: 'dec-116',
        obligationId: 'obl-orbit-cit-2025',
        decisionType: 'FILING_APPROVAL',
        summary: 'Approved release after final tie-out and receipt verification.',
        owner: 'Senior Tax Reviewer',
        participants: ['T. Jackson', 'P. Singh'],
        outcome: 'Filed one day before statutory deadline.',
        evidenceRefs: ['doc-1107', 'audit-548'],
        occurredAt: '2026-04-14T17:55:00Z',
      },
    ],
  },
  adminDashboardStory: {
    overview:
      'Operations leadership monitors deadline risk, blocker aging, and weekly throughput trends to rebalance reviewer capacity before due-date spikes.',
    kpis: {
      upcomingDeadlines7d: 3,
      blockedReturns: 1,
      medianBlockerAgeDays: 6,
      filingsCompleted30d: 11,
      onTimeFilingRate: 0.97,
    },
    deadlineQueue: [
      {
        obligationId: 'obl-nova-payroll-mar',
        clientName: 'Nova Retail Group',
        period: '2026-03',
        dueDate: '2026-04-20',
        daysRemaining: 2,
        status: 'BLOCKED',
      },
      {
        obligationId: 'obl-orbit-sales-2026q1',
        clientName: 'Orbit Logistics LLC',
        period: '2026-Q1',
        dueDate: '2026-04-25',
        daysRemaining: 7,
        status: 'DRAFT',
      },
      {
        obligationId: 'obl-nova-vat-2026q1',
        clientName: 'Nova Retail Group',
        period: '2026-Q1',
        dueDate: '2026-04-30',
        daysRemaining: 12,
        status: 'READY',
      },
    ],
    blockerAging: [
      {
        blocker: 'Missing signed officer declaration',
        openCount: 1,
        p50AgeDays: 6,
        p90AgeDays: 6,
        owner: 'Client Controller',
      },
      {
        blocker: 'Unreconciled fringe benefit ledger variance',
        openCount: 1,
        p50AgeDays: 4,
        p90AgeDays: 4,
        owner: 'Payroll Analyst',
      },
    ],
    filingThroughput: [
      { weekStart: '2026-03-23', filedCount: 2, readyCount: 5, blockedCount: 2 },
      { weekStart: '2026-03-30', filedCount: 3, readyCount: 6, blockedCount: 2 },
      { weekStart: '2026-04-06', filedCount: 4, readyCount: 4, blockedCount: 1 },
      { weekStart: '2026-04-13', filedCount: 2, readyCount: 3, blockedCount: 1 },
    ],
  },
};

/**
 * Serializable DTOs for payroll API responses and client wiring.
 */

export type PayrollRunStatusDto = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'POSTED';

export type PayrollPeriodSummaryDto = {
  id: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'PROCESSING' | 'CLOSED';
  latestRun: PayrollRunListItemDto | null;
};

export type PayrollRunListItemDto = {
  id: string;
  version: number;
  status: PayrollRunStatusDto;
  totalEarnings: string;
  totalDeductions: string;
  totalEmployerCosts: string;
  totalNetPay: string;
  generatedAt: string;
  approvedAt: string | null;
};

export type PayrollOverviewKpisDto = {
  grossPayroll: string;
  deductions: string;
  netPayout: string;
  employerCost: string;
  runCount: number;
};

export type PayrollStatusCountDto = {
  status: PayrollRunStatusDto;
  count: number;
};

export type PayrollOverviewResponseDto = {
  periods: PayrollPeriodSummaryDto[];
  kpis: PayrollOverviewKpisDto;
  statusCounts: PayrollStatusCountDto[];
  adapterStatus: {
    source: 'WORKFORCE' | 'STANDALONE';
    workforceModuleEnabled: boolean;
    badgeLabel: string;
  };
};

export type PayrollLineItemDto = {
  id: string;
  earnings: string;
  deductions: string;
  employerCosts: string;
  netPay: string;
  currency: string;
  breakdownJson: unknown;
  calculationLog: unknown;
  employee: {
    id: string;
    employeeCode: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
    departmentName: string | null;
    designation: string | null;
  };
};

export type PayrollRunCapabilitiesDto = {
  canSubmitReview: boolean;
  canApprove: boolean;
  canReturnDraft: boolean;
  canReturnReview: boolean;
  canPost: boolean;
};

export type PayrollRunDetailDto = {
  id: string;
  workspaceId: string;
  periodId: string;
  version: number;
  status: PayrollRunStatusDto;
  preparedByUserId: string | null;
  totalEarnings: string;
  totalDeductions: string;
  totalEmployerCosts: string;
  totalNetPay: string;
  generatedAt: string;
  approvedAt: string | null;
  capabilities: PayrollRunCapabilitiesDto;
  period: {
    id: string;
    startDate: string;
    endDate: string;
    status: 'OPEN' | 'PROCESSING' | 'CLOSED';
  };
  lineItems: PayrollLineItemDto[];
  posting: {
    postingStatus: 'PENDING' | 'POSTED' | 'FAILED';
    postedAt: string | null;
    journalReference: string | null;
    accountingTransactionId: string | null;
    errorMessage: string | null;
  } | null;
};

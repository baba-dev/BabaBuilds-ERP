import "server-only";

import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type GroupReportScopeOptions = {
  includeArchivedCompanies?: boolean;
};

export type GroupReportScopeCompany = {
  workspaceId: string;
  companyName: string;
  currency: string;
  isArchived: boolean;
};

export type GroupReportScope = {
  groupId: string;
  memberId: string;
  accessMode: string;
  companies: GroupReportScopeCompany[];
  workspaceIds: string[];
};

export type GroupReportFilters = GroupReportScopeOptions & {
  from?: Date;
  to?: Date;
  statuses?: InvoiceStatus[];
};

export type ConsolidatedInvoiceReportRow = {
  companyId: string;
  companyName: string;
  workspaceId: string;
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  client: string;
  date: Date;
  dueDate: Date | null;
  total: Prisma.Decimal;
  amountReceived: Prisma.Decimal;
  amountOutstanding: Prisma.Decimal;
  status: InvoiceStatus;
};

export type ConsolidatedReceivablesReportRow = ConsolidatedInvoiceReportRow;
export type RevenueByCompanyReportRow = ConsolidatedInvoiceReportRow;

const ALL_COMPANIES_ACCESS_MODES = new Set(["ALL_COMPANIES", "ALL_COMPANIES_IN_GROUP"]);

export async function getGroupReportScope(
  userId: string,
  groupId: string,
  options: GroupReportScopeOptions = {},
): Promise<GroupReportScope> {
  const membership = await prisma.companyGroupMember.findFirst({
    where: { userId, companyGroupId: groupId, isActive: true },
    select: {
      id: true,
      accessMode: true,
      companyGroup: {
        select: {
          workspaces: {
            where: options.includeArchivedCompanies ? undefined : { isActive: true },
            select: {
              isActive: true,
              workspace: {
                select: { id: true, name: true, baseCurrency: true },
              },
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
        },
      },
      workspaceAccess: {
        where: {
          isActive: true,
          workspace: {
            companyGroupLinks: {
              some: {
                companyGroupId: groupId,
                ...(options.includeArchivedCompanies ? {} : { isActive: true }),
              },
            },
          },
        },
        select: {
          workspace: {
            select: {
              id: true,
              name: true,
              baseCurrency: true,
              companyGroupLinks: {
                where: { companyGroupId: groupId },
                select: { isActive: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!membership) {
    throw new Error("Active company group membership not found");
  }

  const companiesByWorkspaceId = new Map<string, GroupReportScopeCompany>();

  if (ALL_COMPANIES_ACCESS_MODES.has(membership.accessMode)) {
    for (const link of membership.companyGroup.workspaces) {
      companiesByWorkspaceId.set(link.workspace.id, {
        workspaceId: link.workspace.id,
        companyName: link.workspace.name,
        currency: link.workspace.baseCurrency,
        isArchived: !link.isActive,
      });
    }
  } else {
    for (const access of membership.workspaceAccess) {
      const groupLink = access.workspace.companyGroupLinks[0];
      companiesByWorkspaceId.set(access.workspace.id, {
        workspaceId: access.workspace.id,
        companyName: access.workspace.name,
        currency: access.workspace.baseCurrency,
        isArchived: groupLink ? !groupLink.isActive : false,
      });
    }
  }

  const companies = Array.from(companiesByWorkspaceId.values());

  return {
    groupId,
    memberId: membership.id,
    accessMode: membership.accessMode,
    companies,
    workspaceIds: companies.map((company) => company.workspaceId),
  };
}

export async function getConsolidatedInvoiceReport(
  userId: string,
  groupId: string,
  filters: GroupReportFilters = {},
): Promise<ConsolidatedInvoiceReportRow[]> {
  return getInvoiceRows(userId, groupId, filters);
}

export async function getConsolidatedReceivablesReport(
  userId: string,
  groupId: string,
  filters: GroupReportFilters = {},
): Promise<ConsolidatedReceivablesReportRow[]> {
  const statuses = filters.statuses ?? [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID];
  return getInvoiceRows(userId, groupId, { ...filters, statuses });
}

export async function getRevenueByCompanyReport(
  userId: string,
  groupId: string,
  filters: GroupReportFilters = {},
): Promise<RevenueByCompanyReportRow[]> {
  return getInvoiceRows(userId, groupId, { ...filters, statuses: filters.statuses ?? [InvoiceStatus.PAID] });
}

async function getInvoiceRows(
  userId: string,
  groupId: string,
  filters: GroupReportFilters,
): Promise<ConsolidatedInvoiceReportRow[]> {
  const scope = await getGroupReportScope(userId, groupId, filters);
  if (scope.workspaceIds.length === 0) return [];

  const companyByWorkspaceId = new Map(scope.companies.map((company) => [company.workspaceId, company]));
  const invoiceDate: Prisma.DateTimeFilter = {};
  if (filters.from) invoiceDate.gte = filters.from;
  if (filters.to) invoiceDate.lte = filters.to;

  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: { in: scope.workspaceIds },
      ...(Object.keys(invoiceDate).length > 0 ? { invoiceDate } : {}),
      ...(filters.statuses && filters.statuses.length > 0 ? { status: { in: filters.statuses } } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      invoiceNumber: true,
      clientName: true,
      invoiceDate: true,
      dueDate: true,
      totalAmount: true,
      grandTotal: true,
      amountReceived: true,
      status: true,
    },
    orderBy: [{ invoiceDate: "desc" }, { invoiceNumber: "asc" }],
  });

  return invoices.map((invoice) => {
    const company = companyByWorkspaceId.get(invoice.workspaceId);
    if (!company) throw new Error(`Invoice workspace ${invoice.workspaceId} is outside resolved group report scope`);

    const total = invoice.grandTotal.gt(0) ? invoice.grandTotal : invoice.totalAmount;
    const amountReceived = invoice.amountReceived ?? new Prisma.Decimal(0);

    return {
      companyId: invoice.workspaceId,
      companyName: company.companyName,
      workspaceId: invoice.workspaceId,
      currency: company.currency,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      client: invoice.clientName,
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total,
      amountReceived,
      amountOutstanding: Prisma.Decimal.max(total.minus(amountReceived), new Prisma.Decimal(0)),
      status: invoice.status,
    };
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { buildBaseWhere, buildListWhere, buildOrderBy, parseInvoiceListQuery, startOfUtcToday } from "@/lib/invoices/query";
import { toListItem } from "@/lib/invoices/serialize";
import type { InvoiceDisplayStatus, InvoiceListResponse } from "@/lib/invoices/types";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

const LIST_SELECT = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  dueDate: true,
  clientId: true,
  clientName: true,
  currency: true,
  exchangeRate: true,
  grandTotal: true,
  totalAmount: true,
  baseGrandTotal: true,
  amountReceived: true,
  status: true,
  source: true,
  sourceProposalId: true,
  retainerId: true,
  providerGateway: true,
  providerPaymentLinkId: true,
  sentAt: true,
  lastReminderSentAt: true,
  createdAt: true,
  pdfPath: true,
} as const;

export async function GET(request: Request) {
  try {
    const auth = await requireInvoiceAccess("invoices.view");
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.access;

    const parsed = parseInvoiceListQuery(new URL(request.url).searchParams);
    if (!parsed.success) {
      return apiError(400, "INVALID_QUERY", "Invalid filters.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const query = parsed.data;
    const now = new Date();
    const today = startOfUtcToday(now);
    const where = buildListWhere(workspaceId, query, now);
    const baseWhere = buildBaseWhere(workspaceId, query);

    // Deep link: jump to the page that contains `focus` (default ordering), instead of scanning pages client-side.
    let page = query.page;
    let sortQuery = query;
    let focusFound = false;
    if (query.focus) {
      sortQuery = { ...query, sort: "invoiceDate", dir: "desc" };
      const target = await prisma.invoice.findFirst({
        where: { AND: [where, { id: query.focus }] },
        select: { id: true, invoiceDate: true },
      });
      if (target) {
        const ahead = await prisma.invoice.count({
          where: {
            AND: [
              where,
              { OR: [{ invoiceDate: { gt: target.invoiceDate } }, { invoiceDate: target.invoiceDate, id: { gt: target.id } }] },
            ],
          },
        });
        page = Math.floor(ahead / query.limit) + 1;
        focusFound = true;
      }
    }

    const [rows, totalRecords, grouped, overduePending, overduePartial] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: buildOrderBy(sortQuery),
        skip: (page - 1) * query.limit,
        take: query.limit,
        select: LIST_SELECT,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
      prisma.invoice.count({ where: { AND: [baseWhere, { status: "PENDING", dueDate: { lt: today } }] } }),
      prisma.invoice.count({ where: { AND: [baseWhere, { status: "PARTIALLY_PAID", dueDate: { lt: today } }] } }),
    ]);

    const count = (status: string) => grouped.find((g) => g.status === status)?._count._all ?? 0;
    const statusCounts: Record<InvoiceDisplayStatus, number> = {
      PENDING: count("PENDING") - overduePending,
      PARTIALLY_PAID: count("PARTIALLY_PAID") - overduePartial,
      PAID: count("PAID"),
      VOID: count("VOID"),
      OVERDUE: overduePending + overduePartial,
    };

    const body: InvoiceListResponse & { meta: { focusFound?: boolean } } = {
      data: rows.map((row) => toListItem(row, now)),
      meta: {
        page,
        limit: query.limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / query.limit)),
        statusCounts,
        ...(query.focus ? { focusFound } : {}),
      },
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("API Error fetching invoices:", error);
    return apiError(500, "INVOICES_FETCH_FAILED", "Failed to fetch invoices.");
  }
}

import type { Prisma } from "@prisma/client";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { toDecimal } from "@/lib/money";
import { amountsOfItems } from "@/lib/retainers/pricing";
import { monthlyEquivalent, upcomingDates } from "@/lib/retainers/schedule";
import { getDisplayStatus, normalizeStatus, startOfUtcDay } from "@/lib/retainers/status";
import type { RetainerDetailDto, RetainerInvoiceDto, RetainerListItemDto } from "@/lib/retainers/types";

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const listInclude = {
  client: { select: { id: true, name: true, email: true } },
  items: true,
  sourceProposal: { select: { id: true, proposalNo: true } },
  meteredUsages: { where: { status: "PENDING" }, select: { id: true } },
} satisfies Prisma.RetainerInclude;

export const detailInclude = {
  client: { select: { id: true, name: true, email: true } },
  items: { orderBy: { id: "asc" as const } },
  sourceProposal: { select: { id: true, proposalNo: true } },
  meteredUsages: { orderBy: { createdAt: "desc" as const }, take: 50 },
  events: { orderBy: { createdAt: "desc" as const }, take: 100 },
  invoices: {
    orderBy: { invoiceDate: "desc" as const },
    take: 24,
    select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, status: true, currency: true, grandTotal: true, totalAmount: true, amountReceived: true },
  },
} satisfies Prisma.RetainerInclude;

type ListRow = Prisma.RetainerGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.RetainerGetPayload<{ include: typeof detailInclude }>;

export function serializeListItem(row: ListRow, now = new Date()): RetainerListItemDto {
  const status = normalizeStatus(row.status);
  const a = amountsOfItems(row.items);
  return {
    id: row.id,
    name: row.name || row.serviceName || row.items[0]?.title || "Retainer",
    clientId: row.clientId,
    clientName: row.client.name,
    status,
    displayStatus: getDisplayStatus(status, row.nextBillingDate, now),
    frequency: row.frequency,
    currency: row.currency,
    subtotal: a.subtotal.toFixed(2),
    taxAmount: a.tax.toFixed(2),
    total: a.total.toFixed(2),
    monthlyTotal: monthlyEquivalent(a.total.toNumber(), row.frequency).toFixed(2),
    nextBillingDate: row.nextBillingDate.toISOString(),
    daysToNext: Math.round((startOfUtcDay(row.nextBillingDate) - startOfUtcDay(now)) / DAY),
    endDate: iso(row.endDate),
    maxCycles: row.maxCycles,
    cyclesBilled: row.cyclesBilled,
    lastBilledAt: iso(row.lastBilledAt),
    lastError: row.lastError,
    itemCount: row.items.length,
    pendingUsageCount: row.meteredUsages.length,
    emailInvoice: row.emailInvoice,
    autoAppendMonth: row.autoAppendMonth,
    sourceProposal: row.sourceProposal,
  };
}

function invoiceDto(i: DetailRow["invoices"][number], now: Date): RetainerInvoiceDto {
  const total = effectiveTotal(i);
  const open = i.status === "PENDING" || i.status === "PARTIALLY_PAID";
  const balance = open ? total.minus(toDecimal(i.amountReceived ?? 0)) : toDecimal(0);
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    invoiceDate: i.invoiceDate.toISOString(),
    dueDate: iso(i.dueDate),
    status: i.status,
    currency: i.currency,
    total: total.toFixed(2),
    balance: (balance.lt(0) ? toDecimal(0) : balance).toFixed(2),
    overdue: open && i.dueDate !== null && startOfUtcDay(i.dueDate) < startOfUtcDay(now),
  };
}

export function serializeDetail(row: DetailRow, now = new Date()): RetainerDetailDto {
  const base = serializeListItem({ ...row, meteredUsages: row.meteredUsages.filter((u) => u.status === "PENDING").map((u) => ({ id: u.id })) }, now);
  const a = amountsOfItems(row.items);
  const invoices = row.invoices.map((i) => invoiceDto(i, now));
  const sum = (f: (i: RetainerInvoiceDto) => string) => invoices.reduce((acc, i) => acc.plus(toDecimal(f(i))), toDecimal(0));
  return {
    ...base,
    notes: row.notes,
    clientEmail: row.client.email,
    exchangeRate: row.exchangeRate.toString(),
    paymentTermsDays: row.paymentTermsDays,
    items: row.items.map((i) => ({
      id: i.id,
      serviceTemplateId: i.serviceTemplateId,
      title: i.title,
      quantity: i.quantity,
      unitPrice: toDecimal(i.unitPrice).toFixed(2),
      taxRatePercent: Math.round((i.taxRate ?? 0) * 10_000) / 100,
      total: toDecimal(i.quantity).mul(toDecimal(i.unitPrice)).toFixed(2),
    })),
    upcoming:
      row.status === "ACTIVE" || row.status === "PAUSED"
        ? upcomingDates(row.nextBillingDate, row.frequency, { endDate: row.endDate, maxCycles: row.maxCycles, cyclesBilled: row.cyclesBilled }, 3).map((d) => ({ date: d.toISOString(), total: a.total.toFixed(2) }))
        : [],
    usage: row.meteredUsages.map((u) => ({
      id: u.id,
      description: u.description,
      quantity: u.quantity.toString(),
      unitPrice: toDecimal(u.unitPrice).toFixed(2),
      total: toDecimal(u.quantity).mul(toDecimal(u.unitPrice)).toFixed(2),
      status: u.status,
      createdAt: u.createdAt.toISOString(),
    })),
    invoices,
    invoiceTotals: { billed: sum((i) => i.total).toFixed(2), outstanding: sum((i) => i.balance).toFixed(2), count: invoices.length },
    timeline: row.events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })),
  };
}

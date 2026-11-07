import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fyRangeFromLabel } from "@/lib/invoices/period";
import { INVOICE_SOURCES, type InvoiceDisplayStatus } from "@/lib/invoices/types";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 15;

const DISPLAY_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const;
const SORT_FIELDS = ["invoiceDate", "dueDate", "invoiceNumber", "clientName", "amount", "status"] as const;

/** Accepts `a,b`, repeated params, or arrays. */
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const list = Array.isArray(value) ? value : String(value).split(",");
    return list.map((v) => String(v).trim()).filter(Boolean);
  }, z.array(item).max(12).optional());

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
  .transform((v) => new Date(v));

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(120).optional(),
  status: csv(z.enum(DISPLAY_STATUSES)),
  source: csv(z.enum(INVOICE_SOURCES)),
  clientId: z.string().trim().max(64).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  /** "26-27" or "all". */
  fy: z.string().trim().max(8).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(SORT_FIELDS).default("invoiceDate"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  focus: z.string().trim().max(64).optional(),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export function parseInvoiceListQuery(searchParams: URLSearchParams) {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return invoiceListQuerySchema.safeParse(raw);
}

export function startOfUtcToday(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Filters that do not depend on the status chips (so chip counts stay stable while filtering by status). */
export function buildBaseWhere(workspaceId: string, query: InvoiceListQuery): Prisma.InvoiceWhereInput {
  const and: Prisma.InvoiceWhereInput[] = [];

  if (query.q) {
    and.push({
      OR: [
        { invoiceNumber: { contains: query.q } },
        { clientName: { contains: query.q } },
        { serviceDescription: { contains: query.q } },
      ],
    });
  }
  if (query.clientId) and.push({ clientId: query.clientId });
  if (query.currency) and.push({ currency: query.currency });
  if (query.source?.length) and.push({ source: { in: query.source } });

  const fyRange = query.fy && query.fy !== "all" ? fyRangeFromLabel(query.fy) : null;
  const from = query.from ?? fyRange?.from;
  const to = query.to ?? fyRange?.to;
  if (from || to) {
    and.push({ invoiceDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  }

  return { workspaceId, ...(and.length ? { AND: and } : {}) };
}

function statusCondition(status: InvoiceDisplayStatus, today: Date): Prisma.InvoiceWhereInput {
  const notYetDue: Prisma.InvoiceWhereInput = { OR: [{ dueDate: null }, { dueDate: { gte: today } }] };
  switch (status) {
    case "OVERDUE":
      return { status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: today } };
    case "PENDING":
      return { AND: [{ status: "PENDING" }, notYetDue] };
    case "PARTIALLY_PAID":
      return { AND: [{ status: "PARTIALLY_PAID" }, notYetDue] };
    case "PAID":
      return { status: "PAID" };
    case "VOID":
      return { status: "VOID" };
  }
}

export function buildListWhere(workspaceId: string, query: InvoiceListQuery, now = new Date()): Prisma.InvoiceWhereInput {
  const base = buildBaseWhere(workspaceId, query);
  if (!query.status?.length) return base;
  const today = startOfUtcToday(now);
  return { AND: [base, { OR: query.status.map((s) => statusCondition(s, today)) }] };
}

export function buildOrderBy(query: InvoiceListQuery): Prisma.InvoiceOrderByWithRelationInput[] {
  const dir = query.dir;
  const primary: Prisma.InvoiceOrderByWithRelationInput =
    query.sort === "amount" ? { baseGrandTotal: dir } : ({ [query.sort]: dir } as Prisma.InvoiceOrderByWithRelationInput);
  // Stable tie-breaker so pagination never repeats/skips rows.
  return [primary, { id: dir }];
}

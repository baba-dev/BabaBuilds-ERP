import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { num, r2 } from '@/lib/reporting/helpers';
import type { Ctx, Row } from '@/lib/reporting/types';

/**
 * The only way report queries are built from user choices: a fixed menu of measures, groupings and filters, each mapped to a
 * vetted SQL fragment. Nothing a person types is ever placed in the query text; values go in as bound parameters.
 * PostgreSQL stores native timestamps; all mixed-case identifiers must be quoted.
 */
const INV_BASE = 'COALESCE(NULLIF("totalAmount", 0), "grandTotal")';
const INV_RATE = 'COALESCE(NULLIF("exchangeRate", 0), 1)';
const EXP_ITC = `CASE WHEN "itcStatus" = 'ELIGIBLE' AND "itcHeld" = false THEN COALESCE("igstAmount", 0) + COALESCE("cgstAmount", 0) + COALESCE("sgstAmount", 0) + COALESCE("cessAmount", 0) ELSE 0 END`;
const when = (col: string, fmt: string) => `to_char("${col}", '${fmt === '%Y-%m' ? 'YYYY-MM' : 'YYYY'}')`;
const quarter = (col: string) => `(EXTRACT(YEAR FROM "${col}")::int::text || '-Q' || EXTRACT(QUARTER FROM "${col}")::int::text)`;

type Dim = { sql: string; label: string };
type Measure = { sql: string; format: 'currency' | 'number'; additive: boolean };
type Dataset = { table: string; dateCol: string; base: string; dims: Record<string, Dim>; measures: Record<string, Measure>; amountExpr: string };

export const DATASETS: Record<'invoices' | 'expenses', Dataset> = {
  invoices: {
    table: 'Invoice', dateCol: 'invoiceDate', base: `"status" <> 'VOID' AND "voidedAt" IS NULL`, amountExpr: `(${INV_BASE} * ${INV_RATE})`,
    dims: { month: { sql: when('invoiceDate', '%Y-%m'), label: 'month' }, quarter: { sql: quarter('invoiceDate'), label: 'quarter' }, year: { sql: when('invoiceDate', '%Y'), label: 'year' }, client: { sql: '"clientName"', label: 'client' }, status: { sql: '"status"', label: 'status' }, currency: { sql: '"currency"', label: 'currency' }, taxRate: { sql: 'CAST("taxRate" AS INTEGER)', label: 'taxRate' } },
    measures: {
      revenue: { sql: `SUM(GREATEST(0, ${INV_BASE} - COALESCE("taxAmount", 0)) * ${INV_RATE})`, format: 'currency', additive: true },
      billed: { sql: `SUM(${INV_BASE} * ${INV_RATE})`, format: 'currency', additive: true },
      tax: { sql: `SUM(COALESCE("taxAmount", 0) * ${INV_RATE})`, format: 'currency', additive: true },
      outstanding: { sql: `SUM(GREATEST(0, ${INV_BASE} - COALESCE("amountReceived", 0)) * ${INV_RATE})`, format: 'currency', additive: true },
      count: { sql: 'COUNT(*)', format: 'number', additive: true },
    },
  },
  expenses: {
    table: 'Expense', dateCol: 'date', base: `"approvalStatus" = 'APPROVED'`, amountExpr: '"amount"',
    dims: { month: { sql: when('date', '%Y-%m'), label: 'month' }, quarter: { sql: quarter('date'), label: 'quarter' }, year: { sql: when('date', '%Y'), label: 'year' }, category: { sql: '"category"', label: 'category' }, vendor: { sql: '"vendor"', label: 'vendor' }, paymentStatus: { sql: '"paymentStatus"', label: 'paymentStatus' }, itcStatus: { sql: '"itcStatus"', label: 'itcStatus' } },
    measures: {
      spendNet: { sql: `SUM("amount" - (${EXP_ITC}))`, format: 'currency', additive: true },
      spendGross: { sql: 'SUM("amount")', format: 'currency', additive: true },
      itcClaimable: { sql: `SUM(${EXP_ITC})`, format: 'currency', additive: true },
      unpaid: { sql: "SUM(CASE WHEN "paymentStatus" = 'UNPAID' THEN "amount" ELSE 0 END)", format: 'currency', additive: true },
      count: { sql: 'COUNT(*)', format: 'number', additive: true },
    },
  },
};

export type SemSpec = {
  dataset: 'invoices' | 'expenses'; measures: string[]; dimension: string | null;
  filters: { client?: string; vendor?: string; status?: string[]; category?: string[]; minAmount?: number };
  sort?: { key: string; dir: 'asc' | 'desc' }; limit?: number;
};

const STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID'];
const PAYMENT = ['PAID', 'UNPAID'];

/** Check a spec from the browser against the menu. Unknown names are rejected, never passed on. */
export function validateSpec(raw: unknown): { ok: true; spec: SemSpec } | { ok: false; field: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dataset = r.dataset === 'invoices' || r.dataset === 'expenses' ? r.dataset : null;
  if (!dataset) return { ok: false, field: 'dataset' };
  const ds = DATASETS[dataset];
  const measures = Array.isArray(r.measures) ? [...new Set(r.measures.filter((m): m is string => typeof m === 'string'))] : [];
  if (!measures.length || measures.length > 4 || !measures.every((m) => m in ds.measures)) return { ok: false, field: 'measures' };
  const dimension = r.dimension == null || r.dimension === '' ? null : String(r.dimension);
  if (dimension !== null && !(dimension in ds.dims)) return { ok: false, field: 'dimension' };
  const f = (r.filters && typeof r.filters === 'object' ? r.filters : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);
  const list = (v: unknown, allowed?: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && (!allowed || allowed.includes(x))).slice(0, 20) : undefined);
  const min = Number(f.minAmount);
  const sortKey = (r.sort as { key?: unknown } | undefined)?.key;
  const limit = Math.min(500, Math.max(1, Math.round(Number(r.limit) || 100)));
  return {
    ok: true,
    spec: {
      dataset, measures, dimension, limit,
      filters: {
        client: dataset === 'invoices' ? text(f.client) : undefined, vendor: dataset === 'expenses' ? text(f.vendor) : undefined,
        status: list(f.status, dataset === 'invoices' ? STATUSES : PAYMENT)?.length ? list(f.status, dataset === 'invoices' ? STATUSES : PAYMENT) : undefined,
        category: dataset === 'expenses' ? (list(f.category)?.length ? list(f.category) : undefined) : undefined,
        minAmount: Number.isFinite(min) && min > 0 ? min : undefined,
      },
      sort: typeof sortKey === 'string' && (sortKey === 'dim' || sortKey in ds.measures) ? { key: sortKey, dir: (r.sort as { dir?: unknown }).dir === 'asc' ? 'asc' : 'desc' } : undefined,
    },
  };
}

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Run an already-validated spec for the workspace and period, grouped in the database. */
export async function aggregate(ctx: Pick<Ctx, 'workspaceId' | 'range'>, spec: SemSpec): Promise<{ rows: Row[]; truncated: boolean }> {
  const ds = DATASETS[spec.dataset];
  const where: Prisma.Sql[] = [Prisma.sql`"workspaceId" = ${ctx.workspaceId}`, Prisma.raw(ds.base)];
  if (ctx.range.from) where.push(Prisma.sql`${Prisma.raw('"' + ds.dateCol + '"')} >= ${ctx.range.from}`);
  if (ctx.range.to) where.push(Prisma.sql`${Prisma.raw('"' + ds.dateCol + '"')} < ${ctx.range.to}`);
  const f = spec.filters;
  if (f.client) where.push(Prisma.sql`"clientName" ILIKE ${`%${esc(f.client)}%`} ESCAPE '\\'`);
  if (f.vendor) where.push(Prisma.sql`"vendor" ILIKE ${`%${esc(f.vendor)}%`} ESCAPE '\\'`);
  if (f.status?.length) where.push(spec.dataset === 'invoices' ? Prisma.sql`"status"::text IN (${Prisma.join(f.status)})` : Prisma.sql`"paymentStatus" IN (${Prisma.join(f.status)})`);
  if (f.category?.length) where.push(Prisma.sql`"category" IN (${Prisma.join(f.category)})`);
  if (f.minAmount) where.push(Prisma.sql`${Prisma.raw(ds.amountExpr)} >= ${f.minAmount}`);

  const dim = spec.dimension ? ds.dims[spec.dimension]! : null;
  const select = [dim ? `${dim.sql} AS dim` : `'' AS dim`, ...spec.measures.map((m) => `${ds.measures[m]!.sql} AS "${m}"`)].join(', ');
  const sortKey = spec.sort?.key ?? (dim && ['month', 'quarter', 'year'].includes(spec.dimension!) ? 'dim' : spec.measures[0]!);
  const dir = spec.sort ? spec.sort.dir : sortKey === 'dim' ? 'asc' : 'desc';
  const orderCol = sortKey === 'dim' ? 'dim' : `"${sortKey}"`;
  const limit = Math.min(5000, spec.limit ?? 100);

  const query = Prisma.sql`SELECT ${Prisma.raw(select)} FROM ${Prisma.raw('"' + ds.table + '"')} WHERE ${Prisma.join(where, ' AND ')} ${dim ? Prisma.raw('GROUP BY dim') : Prisma.empty} ORDER BY ${Prisma.raw(orderCol)} ${Prisma.raw(dir === 'asc' ? 'ASC' : 'DESC')} LIMIT ${limit + 1}`;
  const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>(query);
  const truncated = raw.length > limit;
  const rows = raw.slice(0, limit).map((r) => {
    const out: Row = { [spec.dimension ?? 'all']: dim ? String(r.dim ?? '') : null };
    for (const m of spec.measures) out[m] = ds.measures[m]!.format === 'currency' ? r2(num(r[m])) : Math.round(num(r[m]));
    return out;
  });
  return { rows, truncated };
}

import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { containsInsensitive } from "@/lib/prisma-filters";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { isStateCode } from "@/lib/gst/states";
import { validateUdyam } from "@/lib/msme/udyam";
import { vendorKey } from "./vendor-key";

type Db = Prisma.TransactionClient | typeof prisma;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

export const vendorSchema = z.object({
  name: z.string().trim().min(1, "REQUIRED").max(120, "TOO_LONG"),
  gstin: z.string().trim().max(20).nullish(),
  stateCode: z.string().trim().max(2).nullish(),
  email: z.string().trim().toLowerCase().max(200).nullish().refine((v) => !v || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(v), "EMAIL"),
  phone: z.string().trim().max(30).nullish(),
  msmeClass: z.enum(["NONE", "MICRO", "SMALL", "MEDIUM"]).nullish(),
  udyam: z.string().trim().max(30).nullish(),
  paymentTermsDays: z.number().int().min(0).max(365).nullish(),
  defaultCategory: z.string().trim().max(60).nullish(),
  tdsSection: z.string().trim().max(10).nullish(),
  tdsRatePercent: z.number().min(0).max(100).nullish(),
  notes: z.string().trim().max(500).nullish(),
});
export type VendorInput = z.infer<typeof vendorSchema>;

export type VendorIssue = { field: string; code: string };

/** Validates and tidies the fields people type, so GSTIN, state and Udyam are never stored half-right. */
export function normalizeVendor(input: VendorInput): { ok: true; data: Omit<Prisma.VendorUncheckedCreateInput, "workspaceId" | "nameKey"> } | { ok: false; fields: VendorIssue[] } {
  const issues: VendorIssue[] = [];
  const gstin = normalizeGstin(input.gstin) || null;
  let stateCode: string | null = null;
  if (gstin) {
    const check = validateGstin(gstin);
    if (!check.valid) issues.push({ field: "gstin", code: "GSTIN_INVALID" });
    else stateCode = check.stateCode;
  } else if (input.stateCode) {
    if (isStateCode(input.stateCode)) stateCode = input.stateCode; else issues.push({ field: "stateCode", code: "STATE_INVALID" });
  }
  let udyam: string | null = null;
  if (input.udyam?.trim()) {
    const u = validateUdyam(input.udyam);
    if (!u.valid) issues.push({ field: "udyam", code: "UDYAM_INVALID" }); else udyam = u.value;
  }
  if (issues.length) return { ok: false, fields: issues };
  const msmeClass = input.msmeClass && input.msmeClass !== "NONE" ? input.msmeClass : input.msmeClass === "NONE" ? "NONE" : null;
  return {
    ok: true,
    data: {
      name: input.name.replace(/\s+/g, " ").trim(), gstin, stateCode, email: blank(input.email), phone: blank(input.phone), msmeClass, udyam,
      paymentTermsDays: input.paymentTermsDays ?? null, defaultCategory: blank(input.defaultCategory), tdsSection: blank(input.tdsSection),
      tdsRatePercent: input.tdsRatePercent ?? null, notes: blank(input.notes),
    },
  };
}

/**
 * Finds the vendor a bill belongs to by name, creating it on first use. Details already on the vendor are never overwritten;
 * blanks are filled from what this bill knows (GSTIN, state, MSME class) so the next bill starts pre-filled.
 */
export async function resolveVendor(db: Db, workspaceId: string, name: string, known: { gstin?: string | null; stateCode?: string | null; msmeClass?: string | null; udyam?: string | null; category?: string | null } = {}) {
  const key = vendorKey(name);
  if (!key) return null;
  const existing = await db.vendor.findUnique({ where: { workspaceId_nameKey: { workspaceId, nameKey: key } } });
  if (existing) {
    const fill: Prisma.VendorUpdateInput = {};
    if (!existing.gstin && known.gstin) { fill.gstin = known.gstin; if (!existing.stateCode && known.stateCode) fill.stateCode = known.stateCode; }
    if (!existing.msmeClass && known.msmeClass) fill.msmeClass = known.msmeClass;
    if (!existing.udyam && known.udyam) fill.udyam = known.udyam;
    if (!existing.defaultCategory && known.category) fill.defaultCategory = known.category;
    if (existing.archivedAt) fill.archivedAt = null;
    return Object.keys(fill).length ? db.vendor.update({ where: { id: existing.id }, data: fill }) : existing;
  }
  try {
    return await db.vendor.create({ data: { workspaceId, name: name.replace(/\s+/g, " ").trim().slice(0, 120), nameKey: key, gstin: known.gstin ?? null, stateCode: known.stateCode ?? null, msmeClass: known.msmeClass ?? null, udyam: known.udyam ?? null, defaultCategory: known.category ?? null } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return db.vendor.findUnique({ where: { workspaceId_nameKey: { workspaceId, nameKey: key } } });
    throw error;
  }
}

export async function listVendors(workspaceId: string, opts: { q?: string; includeArchived?: boolean; limit?: number } = {}) {
  const q = opts.q?.trim();
  const rows = await prisma.vendor.findMany({
    where: { workspaceId, ...(opts.includeArchived ? {} : { archivedAt: null }), ...(q ? { OR: [{ name: containsInsensitive(q) }, { gstin: containsInsensitive(q) }, { email: containsInsensitive(q) }] } : {}) },
    orderBy: { name: "asc" }, take: Math.min(500, opts.limit ?? 200),
  });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [totals, unpaid, last] = await Promise.all([
    prisma.expense.groupBy({ by: ["vendorId"], where: { workspaceId, vendorId: { in: ids }, approvalStatus: "APPROVED" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.groupBy({ by: ["vendorId"], where: { workspaceId, vendorId: { in: ids }, approvalStatus: "APPROVED", paymentStatus: "UNPAID" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.groupBy({ by: ["vendorId"], where: { workspaceId, vendorId: { in: ids } }, _max: { date: true } }),
  ]);
  const t = new Map(totals.map((x) => [x.vendorId, x]));
  const u = new Map(unpaid.map((x) => [x.vendorId, x]));
  const l = new Map(last.map((x) => [x.vendorId, x._max.date]));
  return rows.map((v) => ({
    ...v, tdsRatePercent: v.tdsRatePercent,
    spend: r2(num(t.get(v.id)?._sum.amount)), count: t.get(v.id)?._count._all ?? 0,
    outstanding: r2(num(u.get(v.id)?._sum.amount)), unpaidCount: u.get(v.id)?._count._all ?? 0,
    lastExpenseAt: l.get(v.id)?.toISOString() ?? null,
  }));
}

/** Folds one vendor into another: bills, recurring schedules and fills the blanks of the kept vendor. */
export async function mergeVendors(workspaceId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) return { ok: false as const, status: 400, code: "MERGE_SAME", message: "Choose two different vendors." };
  const [source, target] = await Promise.all([prisma.vendor.findFirst({ where: { id: sourceId, workspaceId } }), prisma.vendor.findFirst({ where: { id: targetId, workspaceId } })]);
  if (!source || !target) return { ok: false as const, status: 404, code: "VENDOR_NOT_FOUND", message: "Vendor not found." };
  await prisma.$transaction([
    prisma.expense.updateMany({ where: { vendorId: sourceId, workspaceId }, data: { vendorId: targetId, vendor: target.name } }),
    prisma.recurringExpense.updateMany({ where: { vendorId: sourceId, workspaceId }, data: { vendorId: targetId, vendor: target.name } }),
    prisma.vendor.update({ where: { id: targetId }, data: { gstin: target.gstin ?? source.gstin, stateCode: target.stateCode ?? source.stateCode, email: target.email ?? source.email, phone: target.phone ?? source.phone, msmeClass: target.msmeClass ?? source.msmeClass, udyam: target.udyam ?? source.udyam, paymentTermsDays: target.paymentTermsDays ?? source.paymentTermsDays, defaultCategory: target.defaultCategory ?? source.defaultCategory, tdsSection: target.tdsSection ?? source.tdsSection, tdsRatePercent: target.tdsRatePercent ?? source.tdsRatePercent } }),
    prisma.vendor.delete({ where: { id: sourceId } }),
  ]);
  return { ok: true as const };
}

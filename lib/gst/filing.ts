import "server-only";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { periodRange } from "./calendar";
import type { ReturnType } from "./rules";
import { getUnit } from "./service";
import { totalTax } from "./money";

const RETURN_TYPES = ["GSTR1", "IFF", "GSTR3B", "PMT06", "CMP08", "GSTR4", "GSTR9", "GSTR9C"] as const;

export const markFiledSchema = z.object({
  returnType: z.enum(RETURN_TYPES),
  periodKey: z.string().min(4).max(10),
  filedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  arn: z.string().trim().max(40).optional().nullable(),
  isNil: z.boolean().optional(),
  lateFeePaid: z.number().min(0).max(10_000_000).optional(),
  interestPaid: z.number().min(0).max(100_000_000).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const extensionSchema = z.object({
  returnType: z.enum(RETURN_TYPES),
  periodKey: z.string().min(4).max(10),
  extendedDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function markFiled(workspaceId: string, userId: string, input: z.infer<typeof markFiledSchema>) {
  if (!periodRange(input.periodKey)) return { ok: false as const, status: 400, code: "INVALID_PERIOD", message: "Unknown return period." };
  const filedAt = new Date(input.filedAt);
  if (Number.isNaN(filedAt.getTime()) || filedAt.getTime() > Date.now() + 86400000) {
    return { ok: false as const, status: 400, code: "INVALID_DATE", message: "The filing date cannot be in the future." };
  }
  // Freeze what we computed at filing so later edits to the books show up as drift in GSTR-9.
  let snapshot: Record<string, unknown> | null = null;
  if (input.returnType === "GSTR3B" || input.returnType === "GSTR1") {
    const { unit } = await getUnit(workspaceId, input.periodKey);
    if (unit) {
      snapshot = {
        liability: totalTax(unit.gstr3b.payment.liability),
        cash: unit.gstr3b.payment.cashTotal,
        taxable: unit.gstr1.summary.taxable,
        invoiceCount: unit.gstr1.summary.invoiceCount,
        at: new Date().toISOString(),
      };
    }
  }
  const data = {
    status: "FILED",
    filedAt,
    arn: input.arn ?? null,
    filedByUserId: userId,
    isNil: input.isNil ?? false,
    lateFeePaid: input.lateFeePaid ?? 0,
    interestPaid: input.interestPaid ?? 0,
    notes: input.notes ?? null,
    ...(snapshot ? { snapshotJson: snapshot as object } : {}),
  };
  const row = await prisma.gstReturn.upsert({
    where: { workspaceId_returnType_periodKey: { workspaceId, returnType: input.returnType, periodKey: input.periodKey } },
    create: { workspaceId, returnType: input.returnType as ReturnType, periodKey: input.periodKey, ...data },
    update: data,
  });
  return { ok: true as const, row };
}

export async function reopenReturn(workspaceId: string, returnType: string, periodKey: string) {
  const existing = await prisma.gstReturn.findUnique({ where: { workspaceId_returnType_periodKey: { workspaceId, returnType, periodKey } } });
  if (!existing) return { ok: false as const, status: 404, code: "NOT_FOUND", message: "No filing recorded for this period." };
  await prisma.gstReturn.update({ where: { id: existing.id }, data: { status: "OPEN", filedAt: null, arn: null, filedByUserId: null } });
  return { ok: true as const };
}

export async function setExtension(workspaceId: string, input: z.infer<typeof extensionSchema>) {
  if (!periodRange(input.periodKey)) return { ok: false as const, status: 400, code: "INVALID_PERIOD", message: "Unknown return period." };
  const extendedDueDate = input.extendedDueDate ? new Date(input.extendedDueDate) : null;
  await prisma.gstReturn.upsert({
    where: { workspaceId_returnType_periodKey: { workspaceId, returnType: input.returnType, periodKey: input.periodKey } },
    create: { workspaceId, returnType: input.returnType, periodKey: input.periodKey, extendedDueDate },
    update: { extendedDueDate },
  });
  return { ok: true as const };
}

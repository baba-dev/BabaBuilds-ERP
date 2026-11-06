import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid] ?? null;
}

export async function recomputeClientPaymentBehavior(args: {
  workspaceId: string;
  clientId?: string;
  lookbackDays?: number;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const lookbackDays = args.lookbackDays ?? 365;
  const from = new Date(now.getTime() - lookbackDays * MS_PER_DAY);

  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: args.workspaceId,
      ...(args.clientId ? { clientId: args.clientId } : {}),
      clientId: { not: null },
      invoiceDate: { gte: from },
      status: { in: ["PAID", "PARTIALLY_PAID"] },
      dateReceived: { not: null },
    },
    select: {
      clientId: true,
      invoiceDate: true,
      dueDate: true,
      dateReceived: true,
      totalAmount: true,
      amountReceived: true,
      status: true,
    },
  });

  const byClient = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const clientId = inv.clientId;
    if (!clientId) continue;
    const arr = byClient.get(clientId) ?? [];
    arr.push(inv as any);
    byClient.set(clientId, arr);
  }

  const writes: Prisma.ClientPaymentBehaviorUpsertArgs[] = [];
  for (const [clientId, rows] of byClient.entries()) {
    const daysToPay: number[] = [];
    let onTime = 0;
    let late = 0;
    let partial = 0;

    for (const r of rows) {
      const receivedAt = r.dateReceived ? new Date(r.dateReceived) : null;
      if (!receivedAt) continue;
      const invoiceDate = new Date(r.invoiceDate);
      const dt = Math.max(0, Math.round((receivedAt.getTime() - invoiceDate.getTime()) / MS_PER_DAY));
      daysToPay.push(dt);

      const dueDate = r.dueDate ? new Date(r.dueDate) : null;
      if (dueDate) {
        if (receivedAt.getTime() <= dueDate.getTime()) onTime++;
        else late++;
      }

      if (r.status === "PARTIALLY_PAID") partial++;
    }

    const count = rows.length || 1;
    const avg = daysToPay.length ? daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length : null;
    const med = median(daysToPay);
    const onTimeRate = (onTime + late) > 0 ? onTime / (onTime + late) : null;
    const lateRate = (onTime + late) > 0 ? late / (onTime + late) : null;
    const partialPaymentRate = count > 0 ? partial / count : null;

    writes.push({
      where: { clientId },
      update: {
        avgDaysToPay: avg,
        medianDaysToPay: med,
        onTimeRate,
        lateRate,
        partialPaymentRate,
        sampleInvoicesCount: rows.length,
        lastComputedAt: now,
      },
      create: {
        workspaceId: args.workspaceId,
        clientId,
        avgDaysToPay: avg,
        medianDaysToPay: med,
        onTimeRate,
        lateRate,
        partialPaymentRate,
        sampleInvoicesCount: rows.length,
        lastComputedAt: now,
      },
    });
  }

  if (writes.length === 0) {
    return { updated: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (const w of writes) {
      await tx.clientPaymentBehavior.upsert(w);
    }
  });

  return { updated: writes.length };
}


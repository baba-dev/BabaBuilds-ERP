import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { addRetainerEvent } from "@/lib/retainers/events";
import type { RetainerPricing } from "@/lib/retainers/pricing";
import type { RetainerInput } from "@/lib/retainers/validation";

export function afterRetainerChange(workspaceId: string, action: string) {
  try {
    invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (error) {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "retainer", action, error: String(error) });
  }
}

export async function resolveCurrency(workspaceId: string, input: Pick<RetainerInput, "currency" | "exchangeRate">) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } });
  const base = ws?.baseCurrency || "INR";
  const currency = input.currency || base;
  return { currency, exchangeRate: currency === base ? 1 : (input.exchangeRate ?? 1), baseCurrency: base };
}

const itemRows = (input: RetainerInput, pricing: RetainerPricing, validTemplates: Set<string>) =>
  input.items.map((i, idx) => ({
    serviceTemplateId: i.serviceTemplateId && validTemplates.has(i.serviceTemplateId) ? i.serviceTemplateId : null,
    title: i.title,
    quantity: i.quantity,
    unitPrice: new Prisma.Decimal(i.unitPrice).toDecimalPlaces(2),
    taxRate: pricing.rates[idx],
  }));

async function validTemplateIds(tx: Prisma.TransactionClient, workspaceId: string, input: RetainerInput) {
  const ids = input.items.map((i) => i.serviceTemplateId).filter((x): x is string => Boolean(x));
  if (!ids.length) return new Set<string>();
  return new Set((await tx.serviceTemplate.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } })).map((t) => t.id));
}

const common = (input: RetainerInput, currency: string, exchangeRate: number) => ({
  clientId: input.clientId,
  name: input.name,
  notes: input.notes,
  frequency: input.frequency,
  nextBillingDate: new Date(input.nextBillingDate),
  endDate: input.endDate ? new Date(input.endDate) : null,
  maxCycles: input.maxCycles,
  autoAppendMonth: input.autoAppendMonth,
  emailInvoice: input.emailInvoice,
  paymentTermsDays: input.paymentTermsDays,
  currency,
  exchangeRate: new Prisma.Decimal(exchangeRate),
});

export async function createRetainer(args: { workspaceId: string; actorUserId: string; input: RetainerInput; pricing: RetainerPricing; currency: string; exchangeRate: number; sourceProposalId?: string | null }) {
  const { workspaceId, input, pricing } = args;
  return prisma.$transaction(async (tx) => {
    const templates = await validTemplateIds(tx, workspaceId, input);
    const created = await tx.retainer.create({
      data: { workspaceId, ...common(input, args.currency, args.exchangeRate), status: "ACTIVE", sourceProposalId: args.sourceProposalId ?? null, items: { create: itemRows(input, pricing, templates) } },
    });
    await addRetainerEvent(tx, { workspaceId, retainerId: created.id, type: "CREATED", actorUserId: args.actorUserId });
    return created;
  });
}

/** Replace content in place; refuses finished retainers. Billing history and cycle counters are untouched. */
export async function updateRetainer(args: { workspaceId: string; retainerId: string; actorUserId: string; input: RetainerInput; pricing: RetainerPricing; currency: string; exchangeRate: number }) {
  const { workspaceId, retainerId, input, pricing } = args;
  return prisma.$transaction(async (tx) => {
    const templates = await validTemplateIds(tx, workspaceId, input);
    const res = await tx.retainer.updateMany({
      where: { id: retainerId, workspaceId, status: { in: ["ACTIVE", "PAUSED"] } },
      data: { ...common(input, args.currency, args.exchangeRate), lastError: null, lastErrorAt: null },
    });
    if (res.count === 0) return null;
    await tx.retainerItem.deleteMany({ where: { retainerId } });
    await tx.retainerItem.createMany({ data: itemRows(input, pricing, templates).map((r) => ({ ...r, retainerId })) });
    await addRetainerEvent(tx, { workspaceId, retainerId, type: "EDITED", actorUserId: args.actorUserId });
    return tx.retainer.findUnique({ where: { id: retainerId } });
  });
}

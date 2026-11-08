import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveTaxRate } from "@/lib/invoice/tax-resolver";
import { calculateInvoiceTotals } from "@/lib/invoice/totals";
import { toDecimal } from "@/lib/money";
import type { ProposalInput } from "@/lib/proposals/validation";

export type ProposalTotals = {
  subtotal: Prisma.Decimal;
  estimatedTax: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  taxRatePercent: number;
  taxLabel: string;
  isTaxExempt: boolean;
  lineTotals: Prisma.Decimal[];
  /** The rate came from a one-off override the user typed in. */
  usedOverride: boolean;
};

export type TotalsResult =
  | { ok: true; totals: ProposalTotals; client: { id: string; name: string; email: string | null; isExport: boolean } }
  | { ok: false; status: 400 | 422; code: string; message: string; details?: Record<string, unknown> };

/**
 * Prices a proposal on the server with the same tax resolution the invoice generator uses, so the number the
 * client sees is the number that will later be invoiced. Nothing is persisted here.
 */
export async function computeProposalTotals(
  workspaceId: string,
  input: Pick<ProposalInput, "clientId" | "items" | "taxRateOverride">,
): Promise<TotalsResult> {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, workspaceId } });
  if (!client) return { ok: false, status: 400, code: "INVALID_CLIENT", message: "Invalid client selected." };

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, include: { workspace: true } });
  const countryCode = profile?.workspace?.countryCode || "IN";
  const defaultTaxRate = (profile as { defaultTaxRate?: number | null } | null)?.defaultTaxRate ?? null;

  const templateIds = input.items.map((i) => i.serviceTemplateId).filter((id): id is string => Boolean(id));
  const templates = templateIds.length
    ? await prisma.serviceTemplate.findMany({ where: { workspaceId, id: { in: templateIds } }, include: { sacCode: true } })
    : [];
  const templateMap = new Map(templates.map((t) => [t.id, t]));
  const serviceTaxRates = input.items
    .map((i) => templateMap.get(i.serviceTemplateId ?? "")?.sacCode?.igstRate ?? null)
    .filter((rate): rate is number => rate !== null && rate !== undefined);

  const resolution = resolveTaxRate({
    countryCode,
    isTaxExempt: Boolean(client.isExport),
    serviceTaxRates,
    workspaceDefaultTaxRate: defaultTaxRate,
    taxRateOverride: input.taxRateOverride,
  });
  const taxLabel = profile?.taxLabel || "Tax";
  if (resolution.requiresUserInput) {
    return {
      ok: false,
      status: 422,
      code: "TAX_RATE_REQUIRED",
      message: "A tax rate is needed before this proposal can be priced.",
      details: { reason: resolution.reason, countryCode, taxLabel, candidates: resolution.candidates ?? [] },
    };
  }

  const lineTotals = input.items.map((i) => toDecimal(i.quantity).mul(toDecimal(i.unitPrice)).toDecimalPlaces(2));
  const totals = calculateInvoiceTotals({
    services: lineTotals.map((amount) => ({ amount: amount.toNumber() })),
    isTaxExempt: Boolean(client.isExport),
    defaultTaxRate: resolution.taxRate,
  });

  return {
    ok: true,
    client: { id: client.id, name: client.name, email: client.email, isExport: Boolean(client.isExport) },
    totals: {
      subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
      estimatedTax: toDecimal(totals.taxAmount).toDecimalPlaces(2),
      totalAmount: toDecimal(totals.total).toDecimalPlaces(2),
      // Stored as a percentage (18), whereas the resolver and invoices use fractions (0.18).
      taxRatePercent: client.isExport ? 0 : Math.round(resolution.taxRate * 10_000) / 100,
      taxLabel,
      isTaxExempt: Boolean(client.isExport),
      lineTotals,
      usedOverride: resolution.source === "override",
    },
  };
}

/** Milestones must add up to the grand total (to the cent). Returns an error message or null. */
export function checkMilestones(milestones: Array<{ amount: number }>, total: Prisma.Decimal): string | null {
  if (milestones.length === 0) return null;
  const sum = milestones.reduce((acc, m) => acc.plus(toDecimal(m.amount)), new Prisma.Decimal(0));
  if (sum.minus(total).abs().gt("0.01")) {
    return `The milestones add up to ${sum.toFixed(2)}, but the proposal total is ${total.toFixed(2)}.`;
  }
  return null;
}

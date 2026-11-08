import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveTaxRate } from "@/lib/invoice/tax-resolver";
import { calculateInvoiceTotals } from "@/lib/invoice/totals";
import { toDecimal } from "@/lib/money";
import type { RetainerInput } from "@/lib/retainers/validation";

export type RetainerPricing = {
  /** Fractions (0.18), the unit RetainerItem.taxRate and invoices use. */
  rates: number[];
  lineTotals: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  taxLabel: string;
  usedOverride: boolean;
};

export type PricingResult =
  | { ok: true; pricing: RetainerPricing; client: { id: string; name: string; email: string | null } }
  | { ok: false; status: 400 | 422; code: string; message: string; details?: Record<string, unknown> };

/** Prices a retainer cycle on the server with the same tax resolution invoices use. Persists nothing. */
export async function priceRetainer(workspaceId: string, input: Pick<RetainerInput, "clientId" | "items" | "taxRateOverride">): Promise<PricingResult> {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, workspaceId } });
  if (!client) return { ok: false, status: 400, code: "INVALID_CLIENT", message: "Invalid client selected." };

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, include: { workspace: true } });
  const countryCode = profile?.workspace?.countryCode || "IN";
  const taxLabel = profile?.taxLabel || "Tax";
  const ids = input.items.map((i) => i.serviceTemplateId).filter((id): id is string => Boolean(id));
  const templates = ids.length ? await prisma.serviceTemplate.findMany({ where: { workspaceId, id: { in: ids } }, include: { sacCode: true } }) : [];
  const byId = new Map(templates.map((t) => [t.id, t]));

  const rates: number[] = [];
  let usedOverride = false;
  for (const item of input.items) {
    if (item.taxRate !== null && item.taxRate !== undefined && !client.isExport) {
      rates.push(Math.round(item.taxRate * 100) / 10_000);
      continue;
    }
    const resolution = resolveTaxRate({
      countryCode,
      isTaxExempt: Boolean(client.isExport),
      serviceTaxRates: [byId.get(item.serviceTemplateId ?? "")?.sacCode?.igstRate ?? null],
      workspaceDefaultTaxRate: profile?.defaultTaxRate ?? null,
      taxRateOverride: input.taxRateOverride,
    });
    if (resolution.requiresUserInput) {
      return {
        ok: false,
        status: 422,
        code: "TAX_RATE_REQUIRED",
        message: "A tax rate is needed before this retainer can be priced.",
        details: { reason: resolution.reason, countryCode, taxLabel, candidates: resolution.candidates ?? [] },
      };
    }
    if (resolution.source === "override") usedOverride = true;
    rates.push(resolution.taxRate);
  }

  const lineTotals = input.items.map((i) => toDecimal(i.quantity).mul(toDecimal(i.unitPrice)).toDecimalPlaces(2));
  const totals = calculateInvoiceTotals({
    services: lineTotals.map((amount, idx) => ({ amount: amount.toNumber(), taxRate: rates[idx] })),
    isTaxExempt: Boolean(client.isExport),
    defaultTaxRate: rates[0] ?? 0,
  });
  return {
    ok: true,
    client: { id: client.id, name: client.name, email: client.email },
    pricing: {
      rates,
      lineTotals,
      subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
      taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2),
      total: toDecimal(totals.total).toDecimalPlaces(2),
      taxLabel,
      usedOverride,
    },
  };
}

export { amountsOfItems } from "@/lib/retainers/pricing-amounts";

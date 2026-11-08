import { NextResponse } from "next/server";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { previewInputSchema } from "@/lib/retainers/validation";
import { priceRetainer } from "@/lib/retainers/pricing";
import type { RetainerPreviewDto } from "@/lib/retainers/types";

/** Prices a cycle on the server so the composer shows exactly what invoices will charge. */
export async function POST(request: Request) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const parsed = previewInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return retainerError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const priced = await priceRetainer(auth.access.workspaceId, parsed.data);
    if (!priced.ok) return retainerError(priced.status, priced.code, priced.message, priced.details);
    const p = priced.pricing;
    const body: RetainerPreviewDto = {
      subtotal: p.subtotal.toFixed(2), taxAmount: p.taxAmount.toFixed(2), total: p.total.toFixed(2), taxLabel: p.taxLabel,
      lineTotals: p.lineTotals.map((l) => l.toFixed(2)), rates: p.rates.map((r) => Math.round(r * 10_000) / 100), upcoming: [],
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Retainer preview error:", error);
    return retainerError(500, "PREVIEW_FAILED", "Could not price this retainer.");
  }
}

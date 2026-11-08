import { NextResponse } from "next/server";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { previewInputSchema } from "@/lib/proposals/validation";
import { computeProposalTotals } from "@/lib/proposals/totals";
import type { ProposalPreviewDto } from "@/lib/proposals/types";

/** Prices a draft with the same server logic used on save, so the composer never shows a different total. */
export async function POST(request: Request) {
  const auth = await requireProposalAccess("proposals.create");
  if (!auth.ok) return auth.response;
  const parsed = previewInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return proposalError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    const priced = await computeProposalTotals(auth.access.workspaceId, parsed.data);
    if (!priced.ok) return proposalError(priced.status, priced.code, priced.message, priced.details);
    const t = priced.totals;
    const body: ProposalPreviewDto = {
      subtotal: t.subtotal.toFixed(2),
      estimatedTax: t.estimatedTax.toFixed(2),
      totalAmount: t.totalAmount.toFixed(2),
      taxRatePercent: t.taxRatePercent,
      taxLabel: t.taxLabel,
      isTaxExempt: t.isTaxExempt,
      lineTotals: t.lineTotals.map((l) => l.toFixed(2)),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Proposal preview error:", error);
    return proposalError(500, "PREVIEW_FAILED", "Could not price this proposal.");
  }
}

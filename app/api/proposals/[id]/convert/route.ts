import { NextResponse } from "next/server";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { convertProposal } from "@/lib/proposals/convert";
import { convertInputSchema } from "@/lib/proposals/validation";
import { afterProposalChange } from "@/lib/proposals/save";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";

/** Accepted proposal -> invoice (+ optional retainer for lines flagged recurring). Safe to retry. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProposalAccess("proposals.convert");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const { id } = await params;

  const parsed = convertInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return proposalError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    const result = await convertProposal({
      workspaceId,
      proposalId: id,
      actorUserId: userId,
      billingMonth: parsed.data.billingMonth,
      invoiceDate: parsed.data.invoiceDate ? new Date(parsed.data.invoiceDate) : undefined,
      createRetainer: parsed.data.createRetainer,
    });
    if (!result.ok) return proposalError(result.status, result.code, result.message);
    afterProposalChange(workspaceId, "convert");
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      /* best effort */
    }
    return NextResponse.json({ success: true, alreadyConverted: result.alreadyConverted, invoice: result.invoice, retainerId: result.retainerId });
  } catch (error) {
    console.error("Proposal conversion error:", error);
    return proposalError(500, "CONVERSION_FAILED", "Could not convert this proposal. Nothing was changed.");
  }
}

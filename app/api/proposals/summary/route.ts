import { NextResponse } from "next/server";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { getProposalSummary } from "@/lib/proposals/summary";

export async function GET() {
  const auth = await requireProposalAccess("proposals.view");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getProposalSummary(auth.access.workspaceId));
  } catch (error) {
    console.error("Proposal summary error:", error);
    return proposalError(500, "SUMMARY_FAILED", "Failed to load proposal summary.");
  }
}

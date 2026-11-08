import { NextResponse } from "next/server";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { addProposalEvent } from "@/lib/proposals/events";
import { detailInclude, serializeDetail } from "@/lib/proposals/serialize";
import { EDITABLE_STATUSES, isEditable, OPEN_STATUSES } from "@/lib/proposals/status";
import { proposalInputSchema } from "@/lib/proposals/validation";
import { checkMilestones, computeProposalTotals } from "@/lib/proposals/totals";
import { resolveCurrency, updateProposal } from "@/lib/proposals/save";

function refreshDashboard(workspaceId: string, action: string) {
  try {
    invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (error) {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "proposal", action, error: String(error) });
  }
}


type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireProposalAccess("proposals.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = await prisma.proposal.findFirst({ where: { id, workspaceId: auth.access.workspaceId }, include: detailInclude });
  if (!row) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  return NextResponse.json({ data: serializeDetail(row) });
}

const archiveSchema = z.object({ archived: z.boolean() });

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const json = await request.json().catch(() => null);

  // Archive / restore is a separate, content-free operation.
  const archive = archiveSchema.safeParse(json);
  if (archive.success) {
    const auth = await requireProposalAccess("proposals.delete");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.access;
    const res = await prisma.proposal.updateMany({
      where: { id, workspaceId },
      data: { archivedAt: archive.data.archived ? new Date() : null },
    });
    if (res.count === 0) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
    if (archive.data.archived) await addProposalEvent(prisma, { workspaceId, proposalId: id, type: "ARCHIVED", actorUserId: userId });
    refreshDashboard(workspaceId, "archive");
    return NextResponse.json({ success: true });
  }

  const auth = await requireProposalAccess("proposals.edit");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;

  const parsed = proposalInputSchema.safeParse(json);
  if (!parsed.success) {
    return proposalError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid proposal.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;

  const existing = await prisma.proposal.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!existing) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  if (!isEditable(existing.status)) {
    return proposalError(409, "PROPOSAL_LOCKED", "An accepted or invoiced proposal can no longer be edited. Duplicate it to make changes.");
  }

  try {
    const priced = await computeProposalTotals(workspaceId, input);
    if (!priced.ok) return proposalError(priced.status, priced.code, priced.message, priced.details);
    const milestoneError = checkMilestones(input.milestones, priced.totals.totalAmount);
    if (milestoneError) return proposalError(400, "MILESTONE_MISMATCH", milestoneError);

    const { currency, exchangeRate } = await resolveCurrency(workspaceId, input);
    const updated = await updateProposal({
      workspaceId,
      proposalId: id,
      actorUserId: userId,
      input,
      totals: priced.totals,
      currency,
      exchangeRate,
      // The client has already seen an earlier version once it is not a draft any more.
      bumpRevision: existing.status !== "DRAFT",
      editableStatuses: [...EDITABLE_STATUSES],
    });
    if (!updated) return proposalError(409, "PROPOSAL_LOCKED", "This proposal was accepted while you were editing it.");

    logActivity({ action: "proposal_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "proposal", id }, request });
    refreshDashboard(workspaceId, "update");
    return NextResponse.json({
      success: true,
      proposal: { id: updated.id, status: updated.status, revision: updated.revision },
      taxRateOverrideUsed: priced.totals.usedOverride ? priced.totals.taxRatePercent : null,
    });
  } catch (error) {
    console.error("Proposal update error:", error);
    return proposalError(500, "PROPOSAL_UPDATE_FAILED", "Failed to update proposal.");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await requireProposalAccess("proposals.delete");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;
  const { id } = await params;

  const row = await prisma.proposal.findFirst({
    where: { id, workspaceId },
    select: { status: true, _count: { select: { generatedInvoices: true, generatedRetainers: true, conversions: true } } },
  });
  if (!row) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");

  const hasLinks = row._count.generatedInvoices + row._count.generatedRetainers + row._count.conversions > 0;
  if (hasLinks || row.status === "ACCEPTED" || row.status === "INVOICED") {
    return proposalError(409, "PROPOSAL_NOT_DELETABLE", "This proposal is signed or linked to billing records, so it can only be archived.", { archivable: true });
  }

  const res = await prisma.proposal.deleteMany({ where: { id, workspaceId, status: { in: ["DRAFT", ...OPEN_STATUSES, "DECLINED"] } } });
  if (res.count === 0) return proposalError(409, "PROPOSAL_NOT_DELETABLE", "This proposal changed while deleting. Refresh and try again.", { archivable: true });

  logActivity({ action: "proposal_deleted", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "proposal", id }, request });
  refreshDashboard(workspaceId, "delete");
  return NextResponse.json({ success: true });
}

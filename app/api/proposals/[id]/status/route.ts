import { NextResponse } from "next/server";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { prisma } from "@/lib/prisma";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { addProposalEvent } from "@/lib/proposals/events";
import { canOwnerTransition } from "@/lib/proposals/status";
import { statusChangeSchema } from "@/lib/proposals/validation";

import { logActivity } from "@/lib/security/activity-log";

async function refreshDashboard(workspaceId: string, action: string) {
  try {
    await invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (error) {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "proposal", action, error: String(error) });
  }
}


/** Owner-initiated moves only (see OWNER_TRANSITIONS). Sending and invoicing have their own endpoints. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = statusChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return proposalError(400, "INVALID_STATUS", "Choose DRAFT, DECLINED or ACCEPTED.");
  const { status: next, note } = parsed.data;

  const auth = await requireProposalAccess(next === "ACCEPTED" ? "proposals.convert" : "proposals.edit");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;

  const row = await prisma.proposal.findFirst({ where: { id, workspaceId }, select: { status: true } });
  if (!row) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  if (!canOwnerTransition(row.status, next)) {
    return proposalError(409, "INVALID_TRANSITION", `A ${row.status.toLowerCase().replace("_", " ")} proposal cannot be moved to ${next.toLowerCase()}.`);
  }

  const now = new Date();
  const data =
    next === "DECLINED"
      ? { status: next, declinedAt: now, declineReason: note || null }
      : next === "ACCEPTED"
        ? { status: next, acceptedAt: now, acceptedByName: email ? `${email} (recorded by owner)` : "Recorded by owner" }
        : { status: next, declinedAt: null, declineReason: null };

  // Compare-and-set on the status we validated against, so a client acting at the same time wins cleanly.
  const res = await prisma.proposal.updateMany({ where: { id, workspaceId, status: row.status }, data });
  if (res.count === 0) return proposalError(409, "STALE_STATUS", "This proposal just changed. Refresh and try again.");

  await addProposalEvent(prisma, {
    workspaceId,
    proposalId: id,
    type: next === "DECLINED" ? "DECLINED" : next === "ACCEPTED" ? "ACCEPTED" : "REOPENED",
    message: note || null,
    actorUserId: userId,
    metadata: { from: row.status, to: next, by: "owner" },
  });
  logActivity({ action: "proposal_status_updated", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "proposal", id }, request, metadata: { from: row.status, to: next } });
  await refreshDashboard(workspaceId, "status_update");
  return NextResponse.json({ success: true, status: next });
}

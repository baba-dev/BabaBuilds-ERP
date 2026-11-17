import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { logActivity } from "@/lib/security/activity-log";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { proposalError } from "@/lib/proposals/access";
import { addProposalEvent, CLIENT_ACTIONABLE, findPublicProposal, isExpired } from "@/lib/proposals/public";
import { afterProposalChange } from "@/lib/proposals/save";

const bodySchema = z.object({
  status: z.enum(["REVISION_REQUESTED", "DECLINED"]).default("REVISION_REQUESTED"),
  clientNote: z.string().trim().min(1, "Please tell us what you would like changed.").max(2000),
});

/** Client asks for changes (or declines) from the share link. The note lives in the event timeline. */
export async function PATCH(request: Request, { params }: { params: Promise<{ token?: string }> }) {
  const { token } = await params;
  if (!token?.trim()) return proposalError(400, "VALIDATION_ERROR", "Proposal token is required.");
  const ip = getClientIp(request);
  const limited = await checkRateLimit(`proposal-feedback:${token}:${ip}`, 10, 15 * 60_000);
  if (!limited.ok) return proposalError(429, "RATE_LIMITED", "Too many requests. Please try again later.");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return proposalError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.");
  const { status, clientNote } = parsed.data;

  const proposal = await findPublicProposal(token);
  if (!proposal) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  if (!CLIENT_ACTIONABLE.includes(proposal.status)) return proposalError(409, "NOT_ACTIONABLE", "This proposal can no longer be changed.");
  if (isExpired(proposal.status, proposal.validUntil)) return proposalError(403, "PROPOSAL_EXPIRED", "This proposal has expired and can no longer be updated.");

  const now = new Date();
  const moved = await prisma.$transaction(async (tx) => {
    const res = await tx.proposal.updateMany({
      where: { id: proposal.id, status: { in: CLIENT_ACTIONABLE } },
      data: status === "DECLINED" ? { status, declinedAt: now, declineReason: clientNote } : { status },
    });
    if (res.count === 0) return false;
    await addProposalEvent(tx, { workspaceId: proposal.workspaceId, proposalId: proposal.id, type: status, message: clientNote });
    return true;
  });
  if (!moved) return proposalError(409, "NOT_ACTIONABLE", "This proposal just changed. Refresh and try again.");

  logActivity({
    action: status === "DECLINED" ? "proposal_declined" : "proposal_revision_requested",
    status: "SUCCESS",
    workspaceId: proposal.workspaceId,
    actor: { email: "Client" },
    entity: { type: "proposal", id: proposal.id },
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: request.headers.get("user-agent") || null,
    metadata: { newStatus: status, note: clientNote },
  }).catch(() => null);
  afterProposalChange(proposal.workspaceId, "client_feedback");
  return NextResponse.json({ success: true, status });
}

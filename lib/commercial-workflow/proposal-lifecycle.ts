import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export async function markProposalAsSent(proposalId: string, workspaceId: string, actorUserId: string | null) {
  const proposal = await prisma.proposal.update({
    where: { id: proposalId, workspaceId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      sentByUserId: actorUserId,
    }
  });

  logActivity({
    action: "proposal_sent",
    status: "SUCCESS",
    workspaceId,
    actor: { userId: actorUserId || "system", email: "system" },
    entity: { type: "proposal", id: proposalId }
  });

  return proposal;
}

export async function markProposalAsViewed(proposalId: string, workspaceId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { client: { select: { name: true } } },
  });
  if (!proposal) return null;

  const now = new Date();
  
  const updated = await prisma.proposal.update({
    where: { id: proposalId, workspaceId },
    data: {
      status: proposal.status === "DRAFT" || proposal.status === "SENT" ? "VIEWED" : proposal.status,
      firstViewedAt: proposal.firstViewedAt || now,
      lastViewedAt: now,
      viewCount: { increment: 1 }
    }
  });

  // Only emit notification on first view to avoid spam
  if (!proposal.firstViewedAt) {
    logActivity({
      action: "proposal_viewed",
      status: "SUCCESS",
      workspaceId,
      entity: { type: "proposal", id: proposalId }
    });

    dispatchNotification({
      event: 'PROPOSAL_VIEWED',
      workspaceId,
      occurrenceKey: 'proposal_' + proposalId + '_first_view',
      data: {
        proposalNo: updated.proposalNo,
        clientName: proposal.client?.name || 'Client',
      },
    }).catch(() => null);
  }

  return updated;
}

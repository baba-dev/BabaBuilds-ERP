import type { Prisma, PrismaClient } from "@prisma/client";
import type { ProposalTimelineEventDto } from "@/lib/proposals/types";

type Db = PrismaClient | Prisma.TransactionClient;

export type ProposalEventType =
  | "CREATED"
  | "EDITED"
  | "SENT"
  | "REMINDER_SENT"
  | "VIEWED"
  | "REVISION_REQUESTED"
  | "ACCEPTED"
  | "DECLINED"
  | "REOPENED"
  | "CONVERTED_INVOICE"
  | "CONVERTED_RETAINER"
  | "ARCHIVED";

export async function addProposalEvent(
  db: Db,
  input: { workspaceId: string; proposalId: string; type: ProposalEventType; message?: string | null; metadata?: Record<string, unknown> | null; actorUserId?: string | null },
) {
  return db.proposalEvent.create({
    data: {
      workspaceId: input.workspaceId,
      proposalId: input.proposalId,
      type: input.type,
      message: input.message ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      actorUserId: input.actorUserId ?? null,
    },
  });
}

type TimelineSource = {
  dateCreated: Date;
  sentAt: Date | null;
  firstViewedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  firstConvertedAt: Date | null;
  status: string;
};

/**
 * Recorded events plus the lifecycle timestamps that older proposals only have as columns, so every
 * proposal shows a sensible history. Recorded events win when both describe the same moment.
 */
export function buildTimeline(
  proposal: TimelineSource,
  events: Array<{ id: string; type: string; message: string | null; createdAt: Date }>,
): ProposalTimelineEventDto[] {
  const recorded = new Set(events.map((e) => e.type));
  const synthetic: ProposalTimelineEventDto[] = [];
  const push = (id: string, type: ProposalEventType, at: Date | null) => {
    if (at && !recorded.has(type)) synthetic.push({ id: `legacy-${id}`, type, message: null, createdAt: at.toISOString() });
  };
  push("created", "CREATED", proposal.dateCreated);
  push("sent", "SENT", proposal.sentAt);
  push("viewed", "VIEWED", proposal.firstViewedAt);
  push("accepted", "ACCEPTED", proposal.acceptedAt);
  if (proposal.status === "DECLINED") push("declined", "DECLINED", proposal.declinedAt);
  push("converted", "CONVERTED_INVOICE", proposal.status === "INVOICED" ? proposal.firstConvertedAt : null);

  return [...events.map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })), ...synthetic].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

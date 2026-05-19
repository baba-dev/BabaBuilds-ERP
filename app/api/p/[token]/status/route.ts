import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_PUBLIC_STATUSES = new Set(["REVISION_REQUESTED"]);
const LOCKED_PROPOSAL_STATUSES = new Set(["ACCEPTED", "INVOICED"]);

type ProposalFeedbackPayload = Record<string, unknown> & {
  clientNote?: string;
  previousDeclineReason?: string;
  revisionRequestedAt?: string;
};

function buildDeclineReasonPayload(existingDeclineReason: string | null, clientNote: string): string {
  let payload: ProposalFeedbackPayload = {};

  if (existingDeclineReason) {
    try {
      const parsed = JSON.parse(existingDeclineReason) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = { ...(parsed as Record<string, unknown>) };
      } else {
        payload.previousDeclineReason = existingDeclineReason;
      }
    } catch {
      payload.previousDeclineReason = existingDeclineReason;
    }
  }

  payload.clientNote = clientNote;
  payload.revisionRequestedAt = new Date().toISOString();

  return JSON.stringify(payload);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token?: string }> },
) {
  try {
    const { token } = await params;
    const trimmedToken = token?.trim();

    if (!trimmedToken) {
      return NextResponse.json({ error: "Proposal token is required." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { status?: unknown; clientNote?: unknown };
    const requestedStatus = typeof body.status === "string" ? body.status : "";
    const clientNote = typeof body.clientNote === "string" ? body.clientNote.trim() : "";

    if (!ALLOWED_PUBLIC_STATUSES.has(requestedStatus)) {
      return NextResponse.json({ error: "Invalid public proposal status transition." }, { status: 400 });
    }

    if (!clientNote) {
      return NextResponse.json({ error: "Client note is required." }, { status: 400 });
    }

    const proposal = await prisma.proposal.findUnique({
      where: { publicToken: trimmedToken },
      select: {
        status: true,
        validUntil: true,
        expiredAt: true,
        declineReason: true,
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }

    if (LOCKED_PROPOSAL_STATUSES.has(proposal.status)) {
      return NextResponse.json({ error: "Proposal is already accepted and cannot be revised." }, { status: 400 });
    }

    if (proposal.expiredAt || new Date() > new Date(proposal.validUntil)) {
      return NextResponse.json({ error: "This proposal has expired and can no longer be updated." }, { status: 403 });
    }

    const updatedProposal = await prisma.proposal.update({
      where: { publicToken: trimmedToken },
      data: {
        status: requestedStatus,
        declinedAt: new Date(),
        declineReason: buildDeclineReasonPayload(proposal.declineReason, clientNote),
      },
      select: { status: true },
    });

    return NextResponse.json({ success: true, status: updatedProposal.status });
  } catch (error) {
    console.error("Public Proposal Status Error:", error);
    return NextResponse.json({ error: "Failed to update proposal status." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClientIp } from "@/lib/request-ip";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { requireProposalAccess } from "@/lib/proposals/access";
import { addProposalEvent } from "@/lib/proposals/events";
import { checkRateLimit } from "@/lib/rate-limit-memory";

// 1. GET: Fetch the telemetry history log for a specific proposal
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireProposalAccess("proposals.view");
    if (!auth.ok) return auth.response;
    const session = { workspaceId: auth.access.workspaceId };
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Check that the proposal exists and belongs to the workspace
    const proposal = await prisma.proposal.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    // Fetch all activity logs related to this proposal
    const logs = await prisma.appActivityLog.findMany({
      where: {
        entityType: "proposal",
        entityId: id,
        workspaceId: session.workspaceId,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("Fetch Telemetry Error:", error);
    return NextResponse.json({ error: "Failed to fetch telemetry logs" }, { status: 500 });
  }
}

// 2. POST: Record a scroll telemetry heartbeat from the viewer
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json().catch(() => ({}));
    const { token, sectionTitle, dwellTimeSeconds, eventType } = body as {
      token?: string;
      sectionTitle: string;
      dwellTimeSeconds: number;
      eventType?: string; // "VIEW" | "HEARTBEAT"
    };

    let workspaceId = "";
    let proposalId = id;
    let actorEmail = "Anonymous Client";

    // A. If publicToken is provided (Client viewing)
    if (token) {
      const proposal = await prisma.proposal.findUnique({
        where: { publicToken: token },
        include: { client: true }
      });
      if (!proposal) {
        return NextResponse.json({ error: "Invalid secure link" }, { status: 400 });
      }
      workspaceId = proposal.workspaceId;
      proposalId = proposal.id;
      actorEmail = proposal.client.email || "Anonymous Client";
      
      // Drafts are not visible to clients; owners previewing their own link do not count as views either.
      if (proposal.status === "DRAFT" || proposal.archivedAt) {
        return NextResponse.json({ success: true });
      }
      const ip = getClientIp(request);
      const limited = checkRateLimit(`proposal-telemetry:${token}:${ip}`, 120, 60_000);
      if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

      if (eventType === "VIEW") {
        const now = new Date();
        await prisma.$transaction(async (tx) => {
          await tx.proposal.update({
            where: { id: proposal.id },
            data: {
              firstViewedAt: proposal.firstViewedAt ? undefined : now,
              lastViewedAt: now,
              viewCount: { increment: 1 },
            },
          });
          if (proposal.status === "SENT") {
            await tx.proposal.updateMany({ where: { id: proposal.id, status: "SENT" }, data: { status: "VIEWED" } });
          }
          if (!proposal.firstViewedAt) {
            await addProposalEvent(tx, { workspaceId: proposal.workspaceId, proposalId: proposal.id, type: "VIEWED" });
          }
        });
        if (!proposal.firstViewedAt) {
          dispatchNotification({
            event: "PROPOSAL_VIEWED",
            workspaceId: proposal.workspaceId,
            data: { proposalNo: proposal.proposalNo, clientName: proposal.client.name },
          }).catch(() => null);
        }
      }
    } else {
      // B. If authenticated workspace user is querying (Sales Rep checking)
      const session = await getServerSession(authOptions);
      if (!session || !session.workspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      workspaceId = session.workspaceId;
      actorEmail = session.user?.email || "Workspace User";
    }

    const clientIp = getClientIp(request);

    // Log the heartbeat event directly in our cryptographically crypt-safe app activity logs
    await logActivity({
      action: eventType === "VIEW" ? "proposal_viewed" : "proposal_section_dwell",
      status: "SUCCESS",
      workspaceId,
      actor: { email: actorEmail },
      entity: { type: "proposal", id: proposalId },
      ipAddress: clientIp === "unknown" ? null : clientIp,
      userAgent: request.headers.get("user-agent") || null,
      metadata: {
        sectionTitle: String(sectionTitle || "Main Overview").slice(0, 120),
        dwellTimeSeconds: Math.min(86_400, Math.max(0, Number(dwellTimeSeconds) || 0)),
        eventType: eventType || "HEARTBEAT"
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Record Telemetry Error:", error);
    return NextResponse.json({ error: "Failed to record telemetry" }, { status: 500 });
  }
}

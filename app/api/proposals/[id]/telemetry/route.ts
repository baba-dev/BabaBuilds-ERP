import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClientIp } from "@/lib/request-ip";

// 1. GET: Fetch the telemetry history log for a specific proposal
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
      
      // Update first/last viewed times and view counts on client interaction
      if (eventType === "VIEW") {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            firstViewedAt: proposal.firstViewedAt ? undefined : new Date(),
            lastViewedAt: new Date(),
            viewCount: { increment: 1 }
          }
        });
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
        sectionTitle: sectionTitle || "Main Overview",
        dwellTimeSeconds: Number(dwellTimeSeconds || 0),
        eventType: eventType || "HEARTBEAT"
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Record Telemetry Error:", error);
    return NextResponse.json({ error: "Failed to record telemetry" }, { status: 500 });
  }
}

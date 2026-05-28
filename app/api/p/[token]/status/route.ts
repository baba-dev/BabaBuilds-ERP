import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-ip';
import { logActivity } from '@/lib/security/activity-log';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;

    const body = await request.json().catch(() => ({}));
    const { status, clientNote } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required.' }, { status: 400 });
    }

    const proposal = await prisma.proposal.findUnique({
      where: { publicToken: token },
      include: { client: true }
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    }

    const clientIp = getClientIp(request);

    const updatedProposal = await prisma.proposal.update({
      where: { publicToken: token },
      data: {
        status: status,
        declinedAt: status === 'REVISION_REQUESTED' ? new Date() : undefined,
        declineReason: clientNote || null,
      }
    });

    await logActivity({
      action: status === 'REVISION_REQUESTED' ? 'proposal_revision_requested' : 'proposal_status_updated',
      status: 'SUCCESS',
      workspaceId: proposal.workspaceId,
      actor: { email: proposal.client.email || 'Anonymous Client' },
      entity: { type: 'proposal', id: proposal.id },
      ipAddress: clientIp === 'unknown' ? null : clientIp,
      userAgent: request.headers.get('user-agent') || null,
      metadata: {
        newStatus: status,
        note: clientNote || ''
      }
    });

    return NextResponse.json({ success: true, status: updatedProposal.status });
  } catch (error) {
    console.error("Proposal Status Update Error:", error);
    return NextResponse.json({ error: 'Failed to update proposal status.' }, { status: 500 });
  }
}

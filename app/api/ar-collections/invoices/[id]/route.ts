import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await requireModule(session.workspaceId, 'AR_COLLECTIONS');
    } catch (error) {
      if (error instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      }
      throw error;
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      followUpStatus?: string;
      sendReminderNow?: boolean;
      collectionRiskScore?: number;
    };

    if (!body.followUpStatus && !body.sendReminderNow && typeof body.collectionRiskScore !== 'number') {
      return NextResponse.json({ error: 'No update payload provided' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId: session.workspaceId },
      select: { id: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await prisma.invoice.update({
      where: { id },
      data: {
        ...(body.followUpStatus ? { followUpStatus: body.followUpStatus.slice(0, 48) } : {}),
        ...(body.sendReminderNow ? { lastReminderSentAt: new Date() } : {}),
        ...(typeof body.collectionRiskScore === 'number'
          ? { collectionRiskScore: Math.max(0, Math.min(100, body.collectionRiskScore)) }
          : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ar-collections/invoices/PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

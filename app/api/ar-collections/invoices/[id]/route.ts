import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac';
import { parseFollowUpStatus, sendArReminderEmailForInvoice } from '@/lib/ar-collections';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceIdForUser(userId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const edit = await withPermission(userId, workspaceId, 'invoices.edit');
    if (!edit.granted) return edit.response;

    try {
      await requireModule(workspaceId, 'AR_COLLECTIONS');
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

    const hasScore = typeof body.collectionRiskScore === 'number' && !Number.isNaN(body.collectionRiskScore);
    const followParsed = body.followUpStatus !== undefined ? parseFollowUpStatus(body.followUpStatus) : undefined;
    if (body.followUpStatus !== undefined && body.followUpStatus.trim() !== '' && followParsed === null) {
      return NextResponse.json({ error: 'Invalid follow-up status' }, { status: 400 });
    }

    if (!followParsed && !body.sendReminderNow && !hasScore) {
      return NextResponse.json({ error: 'No update payload provided' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (body.sendReminderNow) {
      const emailResult = await sendArReminderEmailForInvoice(workspaceId, id);
      if (!emailResult.ok) {
        const status =
          emailResult.code === 'NOT_FOUND'
            ? 404
            : emailResult.code === 'SMTP_NOT_CONFIGURED'
              ? 400
              : emailResult.code === 'NO_CLIENT_EMAIL'
                ? 400
                : 502;
        return NextResponse.json(
          {
            error:
              emailResult.code === 'SMTP_NOT_CONFIGURED'
                ? 'Configure SMTP in Business Settings to send reminders.'
                : emailResult.code === 'NO_CLIENT_EMAIL'
                  ? 'Client has no email on file.'
                  : emailResult.code === 'NOT_FOUND'
                    ? 'Invoice not found'
                    : 'Failed to send reminder email.',
            code: emailResult.code,
          },
          { status },
        );
      }
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (hasScore) {
      data.collectionRiskScore = Math.max(0, Math.min(100, Math.round(body.collectionRiskScore!)));
    }
    if (body.sendReminderNow) {
      data.followUpStatus = followParsed ?? 'REMINDER_SENT';
    } else if (followParsed) {
      data.followUpStatus = followParsed;
    }

    await prisma.invoice.update({ where: { id }, data });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ar-collections/invoices/PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

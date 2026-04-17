import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { appendTaxAuditEvent, newTaxCorrelationId } from '@/lib/tax/audit';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!workspaceId || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requirePermission(userId, workspaceId, 'tax.file');
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { filedAt?: string; notes?: string } | null;
  const filedAt = body?.filedAt ? new Date(body.filedAt) : new Date();
  if (Number.isNaN(filedAt.getTime())) {
    return NextResponse.json({ error: 'Invalid filedAt' }, { status: 400 });
  }

  const period = await prisma.taxReturnPeriod.findFirst({
    where: { id, workspaceId },
  });
  if (!period) {
    return NextResponse.json({ error: 'Return period not found' }, { status: 404 });
  }

  const correlationId = newTaxCorrelationId();

  const updated = await prisma.taxReturnPeriod.update({
    where: { id: period.id },
    data: {
      filedAt,
      status: 'FILED',
      notes: body?.notes?.trim() ? body.notes.trim() : period.notes,
    },
  });

  await appendTaxAuditEvent(prisma, {
    workspaceId,
    eventType: 'RETURN_PERIOD_FILED',
    correlationId,
    actorUserId: userId,
    entityType: 'TaxReturnPeriod',
    entityId: updated.id,
    payload: {
      periodKey: updated.periodKey,
      filedAt: filedAt.toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      id: updated.id,
      periodKey: updated.periodKey,
      filedAt: updated.filedAt?.toISOString() ?? null,
      status: updated.status,
    },
  });
}

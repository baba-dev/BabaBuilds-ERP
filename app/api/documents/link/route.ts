import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { RbacDeniedError, requirePermission, rbacDeniedResponse } from '@/lib/rbac';
import { apiError } from '@/lib/api-error';

type LinkTargetType =
  | 'EXPENSE'
  | 'INVOICE'
  | 'BANK_TRANSACTION'
  | 'CLIENT'
  | 'PROPOSAL'
  | 'RETAINER'
  | 'SERVICE_ORDER'
  | 'PURCHASE_ORDER';

type LinkRelation = 'ATTACHMENT' | 'EVIDENCE' | 'SOURCE_DOC';

function isValidTargetType(v: unknown): v is LinkTargetType {
  return (
    v === 'EXPENSE' ||
    v === 'INVOICE' ||
    v === 'BANK_TRANSACTION' ||
    v === 'CLIENT' ||
    v === 'PROPOSAL' ||
    v === 'RETAINER' ||
    v === 'SERVICE_ORDER' ||
    v === 'PURCHASE_ORDER'
  );
}

function isValidRelation(v: unknown): v is LinkRelation {
  return v === 'ATTACHMENT' || v === 'EVIDENCE' || v === 'SOURCE_DOC';
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');

  try {
    await requireModule(workspaceId, 'DOCUMENTS');
    await requirePermission(userId, workspaceId, 'documents.link');
  } catch (e) {
    if (e instanceof ModuleDisabledError) return apiError(403, 'Documents module is disabled', 'MODULE_DISABLED');
    if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
    throw e;
  }

  const body = (await req.json().catch(() => null)) as
    | {
        documentId?: string;
        targetType?: LinkTargetType;
        targetId?: string;
        relation?: LinkRelation;
      }
    | null;

  const documentId = body?.documentId?.trim();
  const targetId = body?.targetId?.trim();
  const targetType = body?.targetType;
  const relation = body?.relation ?? 'ATTACHMENT';

  if (!documentId || !targetId || !isValidTargetType(targetType) || !isValidRelation(relation)) {
    return apiError(400, 'Invalid link payload', 'INVALID_INPUT');
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true },
  });
  if (!doc) return apiError(404, 'Document not found', 'NOT_FOUND');

  // Best-effort target ownership validation (v1): only enforce for key accounting records.
  if (targetType === 'EXPENSE') {
    const owned = await prisma.expense.findFirst({ where: { id: targetId, workspaceId }, select: { id: true } });
    if (!owned) return apiError(404, 'Expense not found', 'NOT_FOUND');
  }
  if (targetType === 'INVOICE') {
    const owned = await prisma.invoice.findFirst({ where: { id: targetId, workspaceId }, select: { id: true } });
    if (!owned) return apiError(404, 'Invoice not found', 'NOT_FOUND');
  }
  if (targetType === 'BANK_TRANSACTION') {
    const owned = await prisma.bankTransaction.findFirst({ where: { id: targetId, workspaceId }, select: { id: true } });
    if (!owned) return apiError(404, 'Bank transaction not found', 'NOT_FOUND');
  }

  const link = await prisma.documentLink.upsert({
    where: {
      documentId_targetType_targetId: {
        documentId,
        targetType,
        targetId,
      },
    },
    create: {
      workspaceId,
      documentId,
      targetType,
      targetId,
      relation,
      createdByUserId: userId,
    },
    update: {
      relation,
    },
    select: { id: true },
  });

  await prisma.documentAuditEvent.create({
    data: {
      workspaceId,
      documentId,
      eventType: 'LINK_CREATED',
      actorUserId: userId,
      metadata: { targetType, targetId, relation },
    },
  });

  return NextResponse.json({ ok: true, linkId: link.id });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');

  try {
    await requireModule(workspaceId, 'DOCUMENTS');
    await requirePermission(userId, workspaceId, 'documents.link');
  } catch (e) {
    if (e instanceof ModuleDisabledError) return apiError(403, 'Documents module is disabled', 'MODULE_DISABLED');
    if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
    throw e;
  }

  const body = (await req.json().catch(() => null)) as
    | {
        documentId?: string;
        targetType?: LinkTargetType;
        targetId?: string;
      }
    | null;

  const documentId = body?.documentId?.trim();
  const targetId = body?.targetId?.trim();
  const targetType = body?.targetType;
  if (!documentId || !targetId || !isValidTargetType(targetType)) {
    return apiError(400, 'Invalid unlink payload', 'INVALID_INPUT');
  }

  const deleted = await prisma.documentLink.deleteMany({
    where: { workspaceId, documentId, targetType, targetId },
  });

  await prisma.documentAuditEvent.create({
    data: {
      workspaceId,
      documentId,
      eventType: 'LINK_REMOVED',
      actorUserId: userId,
      metadata: { targetType, targetId, deletedCount: deleted.count },
    },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}


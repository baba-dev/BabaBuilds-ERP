import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { appendTaxAuditEvent, newTaxCorrelationId } from '@/lib/tax/audit';
import { taxAdvancedModuleDisabledResponse } from '@/lib/tax/module-gate';

const ENTITY_TYPES = ['RETURN_ACKNOWLEDGMENT', 'WITHHOLDING_CERTIFICATE', 'TAX_PAYMENT_PROOF'] as const;
const RELATIONS = ['ACKNOWLEDGMENT', 'CERTIFICATE', 'PROOF', 'EVIDENCE'] as const;

type EntityType = (typeof ENTITY_TYPES)[number];
type LinkRelation = (typeof RELATIONS)[number];

function isEntityType(value: string | null | undefined): value is EntityType {
  return Boolean(value && ENTITY_TYPES.includes(value as EntityType));
}

function isRelation(value: string | null | undefined): value is LinkRelation {
  return Boolean(value && RELATIONS.includes(value as LinkRelation));
}

async function getAuth() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  return { workspaceId: workspaceId ?? null, userId: userId ?? null };
}

export async function GET(req: Request) {
  const { workspaceId, userId } = await getAuth();
  if (!workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');
  const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
  if (moduleDisabledResponse) return moduleDisabledResponse;

  try {
    await requirePermission(userId, workspaceId, 'tax.view');
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get('entityType');
  const entityKey = url.searchParams.get('entityKey');

  if (!isEntityType(entityType) || !entityKey?.trim()) {
    return apiError(400, 'Missing or invalid entityType/entityKey', 'INVALID_INPUT');
  }

  const links = await prisma.taxDocumentLink.findMany({
    where: {
      workspaceId,
      entityType,
      entityKey: entityKey.trim(),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      entityType: true,
      entityKey: true,
      relation: true,
      notes: true,
      createdAt: true,
      document: {
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, links });
}

export async function POST(req: Request) {
  const { workspaceId, userId } = await getAuth();
  if (!workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');
  const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
  if (moduleDisabledResponse) return moduleDisabledResponse;

  try {
    await requirePermission(userId, workspaceId, 'tax.manage');
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }

  const body = (await req.json().catch(() => null)) as
    | {
        documentId?: string;
        entityType?: string;
        entityKey?: string;
        relation?: string;
        notes?: string;
      }
    | null;

  const documentId = body?.documentId?.trim();
  const entityType = body?.entityType;
  const entityKey = body?.entityKey?.trim();
  const relation = body?.relation ?? 'EVIDENCE';
  const notes = body?.notes?.trim() || null;

  if (!documentId || !isEntityType(entityType) || !entityKey || !isRelation(relation)) {
    return apiError(400, 'Invalid tax document link payload', 'INVALID_INPUT');
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true },
  });

  if (!doc) return apiError(404, 'Document not found', 'NOT_FOUND');

  const link = await prisma.taxDocumentLink.upsert({
    where: {
      workspaceId_documentId_entityType_entityKey: {
        workspaceId,
        documentId,
        entityType,
        entityKey,
      },
    },
    create: {
      workspaceId,
      documentId,
      entityType,
      entityKey,
      relation,
      notes,
      createdByUserId: userId,
    },
    update: {
      relation,
      notes,
    },
    select: {
      id: true,
      createdAt: true,
      relation: true,
      entityType: true,
      entityKey: true,
    },
  });

  await prisma.documentAuditEvent.create({
    data: {
      workspaceId,
      documentId,
      eventType: 'TAX_LINK_UPSERTED',
      actorUserId: userId,
      metadata: {
        entityType,
        entityKey,
        relation,
        notes,
      },
    },
  });

  const correlationId = newTaxCorrelationId();
  await appendTaxAuditEvent(prisma, {
    workspaceId,
    eventType: 'DOCUMENT_LINK',
    correlationId,
    actorUserId: userId,
    entityType: 'TaxDocumentLink',
    entityId: link.id,
    payload: { documentId, entityType, entityKey, relation },
  });

  return NextResponse.json({
    ok: true,
    acknowledgment: {
      message: 'Tax document linked successfully.',
      link,
      acknowledgedAt: new Date().toISOString(),
    },
  });
}

export async function DELETE(req: Request) {
  const { workspaceId, userId } = await getAuth();
  if (!workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');
  const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
  if (moduleDisabledResponse) return moduleDisabledResponse;

  try {
    await requirePermission(userId, workspaceId, 'tax.manage');
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }

  const body = (await req.json().catch(() => null)) as
    | {
        linkId?: string;
      }
    | null;

  const linkId = body?.linkId?.trim();
  if (!linkId) return apiError(400, 'linkId is required', 'INVALID_INPUT');

  const existing = await prisma.taxDocumentLink.findFirst({
    where: { id: linkId, workspaceId },
    select: { id: true, documentId: true, entityType: true, entityKey: true },
  });

  if (!existing) return apiError(404, 'Tax document link not found', 'NOT_FOUND');

  await prisma.taxDocumentLink.delete({ where: { id: existing.id } });

  await prisma.documentAuditEvent.create({
    data: {
      workspaceId,
      documentId: existing.documentId,
      eventType: 'TAX_LINK_REMOVED',
      actorUserId: userId,
      metadata: {
        linkId: existing.id,
        entityType: existing.entityType,
        entityKey: existing.entityKey,
      },
    },
  });

  const correlationId = newTaxCorrelationId();
  await appendTaxAuditEvent(prisma, {
    workspaceId,
    eventType: 'DOCUMENT_LINK',
    correlationId,
    actorUserId: userId,
    entityType: 'TaxDocumentLink',
    entityId: existing.id,
    payload: { action: 'DELETE', documentId: existing.documentId, entityType: existing.entityType, entityKey: existing.entityKey },
  });

  return NextResponse.json({
    ok: true,
    acknowledgment: {
      message: 'Tax document link removed successfully.',
      linkId: existing.id,
      acknowledgedAt: new Date().toISOString(),
    },
  });
}

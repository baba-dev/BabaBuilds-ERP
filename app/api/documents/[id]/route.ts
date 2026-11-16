import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { logActivity } from '@/lib/security/activity-log';

const CATEGORIES = ['EXPENSE_RECEIPT', 'VENDOR_BILL', 'INVOICE_ATTACHMENT', 'BANK_STATEMENT', 'TAX_FILING', 'COMPLIANCE_DOCUMENT', 'BUSINESS_REGISTRATION', 'CONTRACT', 'PERSONAL_USER_DOCUMENT', 'GENERAL_DOCUMENT'] as const;
const patchSchema = z.object({
  title: z.string().trim().min(1, 'Give the document a title.').max(140).optional(),
  category: z.enum(CATEGORIES).optional(),
  archived: z.boolean().optional(),
}).refine((b) => b.title !== undefined || b.category !== undefined || b.archived !== undefined, { message: 'Nothing to change.' });

/** Rename, re-categorise, archive or restore one document. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  if (!userId || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await requireModule(workspaceId, 'DOCUMENTS'); } catch (e) {
    if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'The Document Center is turned off for this workspace.' }, { status: 403 });
    throw e;
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the details.' }, { status: 422 });
  const { title, category, archived } = parsed.data;

  const needs: string[] = [];
  if (title !== undefined || category !== undefined) needs.push('documents.manage');
  if (archived === true) needs.push('documents.archive');
  if (archived === false) needs.push('documents.restore');
  for (const permission of needs) {
    if (!(await checkPermissionSilent(userId, workspaceId, permission as Parameters<typeof checkPermissionSilent>[2]))) return NextResponse.json({ error: 'You do not have permission to do that.' }, { status: 403 });
  }

  const { id } = await params;
  const doc = await prisma.document.findFirst({ where: { id, workspaceId }, select: { id: true, isArchived: true } });
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const updated = await prisma.document.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(archived !== undefined ? { isArchived: archived, archivedAt: archived ? new Date() : null, archivedByUserId: archived ? userId : null, status: archived ? 'ARCHIVED' : 'READY' } : {}),
    },
    select: { id: true, title: true, category: true, isArchived: true, status: true },
  });
  await prisma.documentAuditEvent.create({ data: { workspaceId, documentId: id, eventType: archived === true ? 'ARCHIVED' : archived === false ? 'RESTORED' : 'UPDATED', actorUserId: userId, metadata: { title: title ?? null, category: category ?? null } } });
  void logActivity({ workspaceId, action: archived === true ? 'document.archived' : archived === false ? 'document.restored' : 'document.updated', status: 'SUCCESS', actor: { userId, email: session?.user?.email ?? null }, entity: { type: 'document', id } });
  return NextResponse.json({ data: updated });
}

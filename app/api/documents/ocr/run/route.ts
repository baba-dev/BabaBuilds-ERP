import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { runQueuedOcrJobs } from '@/lib/documents/ocr/runner';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session || !workspaceId || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireModule(workspaceId, 'DOCUMENTS');
    await requirePermission(userId, workspaceId, 'documents.ocr.review');
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Documents module is disabled' }, { status: 403 });
    }
    if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
    throw e;
  }

  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const limit = Math.max(1, Math.min(25, Number(body?.limit ?? 5)));

  const result = await runQueuedOcrJobs({ limit });
  return NextResponse.json({ ok: true, ...result });
}


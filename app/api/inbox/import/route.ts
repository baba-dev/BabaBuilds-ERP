import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { POST as uploadDocument } from '@/app/api/documents/upload/route';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from '@/lib/rbac';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { logActivity } from '@/lib/security/activity-log';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import { discardShared, isValidShareId, loadSharedPayload, markSharedImported, stagedFileName } from '@/lib/uploads/share-target';

export const runtime = 'nodejs';

/** What the person says a shared file is, and how the Document Center files it. */
const CLASSES = {
  EXPENSE: { category: 'EXPENSE_RECEIPT', scope: 'ACCOUNTING' },
  VENDOR_BILL: { category: 'VENDOR_BILL', scope: 'ACCOUNTING' },
  CLIENT: { category: 'INVOICE_ATTACHMENT', scope: 'WORKSPACE_BUSINESS' },
  PROPOSAL: { category: 'CONTRACT', scope: 'WORKSPACE_BUSINESS' },
  GENERAL: { category: 'GENERAL_DOCUMENT', scope: 'GENERAL_ATTACHMENT' },
} as const;

const importSchema = z.object({ shareId: z.string(), index: z.number().int().min(0).max(50), classification: z.enum(['EXPENSE', 'VENDOR_BILL', 'CLIENT', 'PROPOSAL', 'GENERAL']) });
const discardSchema = z.object({ shareId: z.string() });

async function context() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  if (!userId || !workspaceId) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  try {
    await requireModule(workspaceId, 'DOCUMENTS');
    await requirePermission(userId, workspaceId, 'documents.upload');
  } catch (e) {
    if (e instanceof ModuleDisabledError) return { response: NextResponse.json({ error: 'The Document Center is turned off for this workspace.' }, { status: 403 }) } as const;
    if (e instanceof RbacDeniedError) return { response: rbacDeniedResponse(e) as NextResponse } as const;
    throw e;
  }
  return { userId, workspaceId, email: session?.user?.email ?? null } as const;
}

/** Adds one staged shared file to the Document Center. It goes through the normal upload checks (type, size, virus scan, storage quota). */
export async function POST(request: Request) {
  const ctx = await context();
  if ('response' in ctx) return ctx.response;
  const limit = enforceRouteRateLimit({ request, route: '/api/inbox/import', scope: `${ctx.workspaceId}:${ctx.userId}`, max: 60, windowMs: 10 * 60_000 });
  if (!limit.ok) return limit.response;

  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidShareId(parsed.data.shareId)) return NextResponse.json({ error: 'Check the file and type, then try again.' }, { status: 422 });
  const { shareId, index, classification } = parsed.data;

  const payload = await loadSharedPayload(ctx.workspaceId, shareId);
  const file = payload?.files[index];
  if (!payload || !file) return NextResponse.json({ error: 'That shared file is no longer available.' }, { status: 404 });
  if (payload.imported?.[String(index)]) return NextResponse.json({ error: 'That file was already added.', documentId: payload.imported[String(index)] }, { status: 409 });
  const name = stagedFileName(file);
  if (!name) return NextResponse.json({ error: 'That shared file is not valid.' }, { status: 422 });

  let bytes: Buffer;
  try { bytes = await fs.readFile(buildPrivatePath('share-target', [ctx.workspaceId, shareId, name])); }
  catch { return NextResponse.json({ error: 'That shared file is no longer available.' }, { status: 404 }); }

  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], file.originalName, { type: file.mimeType }));
  form.set('category', CLASSES[classification].category);
  form.set('scope', CLASSES[classification].scope);
  if (payload.title) form.set('title', payload.title.slice(0, 140));

  const res = await uploadDocument(new Request(request.url, { method: 'POST', headers: request.headers, body: form }));
  const body = (await res.json().catch(() => ({}))) as { error?: string; documentId?: string; data?: { documentId?: string } };
  const documentId = body.documentId ?? body.data?.documentId;
  if (!res.ok || !documentId) return NextResponse.json({ error: body.error ?? 'The file could not be added.' }, { status: res.ok ? 502 : res.status });

  await markSharedImported(ctx.workspaceId, shareId, index, documentId);
  void logActivity({ workspaceId: ctx.workspaceId, action: 'inbox.shared_file_imported', status: 'SUCCESS', actor: { userId: ctx.userId, email: ctx.email }, entity: { type: 'document', id: documentId }, metadata: { classification, mimeType: file.mimeType } });
  return NextResponse.json({ ok: true, documentId }, { status: 201 });
}

/** Throws away a staged share (its metadata and files). */
export async function DELETE(request: Request) {
  const ctx = await context();
  if ('response' in ctx) return ctx.response;
  const parsed = discardSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isValidShareId(parsed.data.shareId)) return NextResponse.json({ error: 'Check the request.' }, { status: 422 });
  const removed = await discardShared(ctx.workspaceId, parsed.data.shareId);
  if (!removed) return NextResponse.json({ error: 'That share is no longer available.' }, { status: 404 });
  await fs.rm(buildPrivatePath('share-target', [ctx.workspaceId, parsed.data.shareId]), { recursive: true, force: true });
  void logActivity({ workspaceId: ctx.workspaceId, action: 'inbox.shared_content_discarded', status: 'SUCCESS', actor: { userId: ctx.userId, email: ctx.email }, entity: { type: 'share_target', id: parsed.data.shareId } });
  return NextResponse.json({ ok: true });
}

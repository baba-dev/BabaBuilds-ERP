import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import {
  hasTraversal,
  logDeniedAssetAccess,
  servePrivateAsset,
} from '@/lib/security/private-asset';

function getSessionUserId(session: unknown) {
  const user = (session as { user?: { id?: unknown } } | null)?.user;
  return typeof user?.id === 'string' && user.id.trim() ? user.id : null;
}

function getSessionWorkspaceId(session: unknown) {
  const workspaceId = (session as { workspaceId?: unknown } | null)?.workspaceId;
  return typeof workspaceId === 'string' && workspaceId.trim() ? workspaceId : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const filePathArray = resolvedParams.path || [];
  const requestedPath = filePathArray.join('/');
  const [requestedWorkspaceId] = filePathArray;

  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  const sessionWorkspaceId = getSessionWorkspaceId(session);

  if (!userId || !sessionWorkspaceId) {
    logDeniedAssetAccess({ kind: 'invoices', reason: 'unauthorized', request, requestedPath });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (hasTraversal(filePathArray)) {
    logDeniedAssetAccess({ kind: 'invoices', reason: 'path_traversal', request, requestedPath, workspaceId: sessionWorkspaceId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!requestedWorkspaceId) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'workspace_namespace_mismatch',
      request,
      requestedPath,
      workspaceId: sessionWorkspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const workspaceAccess = await prisma.workspaceUser.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: requestedWorkspaceId } },
    select: { id: true, isActive: true },
  });

  if (!workspaceAccess?.isActive) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'workspace_namespace_mismatch',
      request,
      requestedPath,
      workspaceId: requestedWorkspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // A path may target a workspace other than the selected session workspace only
  // after the explicit active membership check above for the requested workspace.

  try {
    await requirePermission(userId, requestedWorkspaceId, 'invoices.export');
  } catch {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'ownership_mismatch',
      request,
      requestedPath,
      workspaceId: requestedWorkspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const relativePath = `/invoices/${filePathArray.join('/')}`;
  const ownedInvoice = await prisma.invoice.findFirst({
    where: { workspaceId: requestedWorkspaceId, pdfPath: relativePath },
    select: { id: true },
  });

  if (!ownedInvoice) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'ownership_mismatch',
      request,
      requestedPath,
      workspaceId: requestedWorkspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  return servePrivateAsset('invoices', filePathArray);
}

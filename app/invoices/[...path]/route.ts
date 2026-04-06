import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getSessionWorkspaceId,
  hasTraversal,
  isWorkspaceNamespaced,
  logDeniedAssetAccess,
  serveAssetFromPublic,
} from '@/lib/security/private-asset';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const filePathArray = resolvedParams.path || [];
  const requestedPath = filePathArray.join('/');

  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    logDeniedAssetAccess({ kind: 'invoices', reason: 'unauthorized', request, requestedPath });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (hasTraversal(filePathArray)) {
    logDeniedAssetAccess({ kind: 'invoices', reason: 'path_traversal', request, requestedPath, workspaceId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!isWorkspaceNamespaced(filePathArray, workspaceId)) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'workspace_namespace_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const relativePath = `/invoices/${filePathArray.join('/')}`;
  const ownedInvoice = await prisma.invoice.findFirst({
    where: { workspaceId, pdfPath: relativePath },
    select: { id: true },
  });

  if (!ownedInvoice) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'ownership_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  return serveAssetFromPublic('invoices', filePathArray);
}

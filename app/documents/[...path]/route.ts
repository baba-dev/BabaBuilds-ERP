import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getSessionWorkspaceId,
  hasTraversal,
  isWorkspaceNamespaced,
  logDeniedAssetAccess,
  servePrivateAsset,
} from '@/lib/security/private-asset';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const filePathArray = resolvedParams.path || [];
  const requestedPath = filePathArray.join('/');

  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    logDeniedAssetAccess({ kind: 'documents', reason: 'unauthorized', request, requestedPath });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (hasTraversal(filePathArray)) {
    logDeniedAssetAccess({ kind: 'documents', reason: 'path_traversal', request, requestedPath, workspaceId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!isWorkspaceNamespaced(filePathArray, workspaceId)) {
    logDeniedAssetAccess({
      kind: 'documents',
      reason: 'workspace_namespace_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const relativePath = `/documents/${filePathArray.join('/')}`;
  const ownedFile = await prisma.documentFile.findFirst({
    where: { workspaceId, storedPath: relativePath },
    select: { id: true },
  });

  if (!ownedFile) {
    logDeniedAssetAccess({
      kind: 'documents',
      reason: 'ownership_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  return servePrivateAsset('documents', filePathArray);
}


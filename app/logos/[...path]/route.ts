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
    logDeniedAssetAccess({ kind: 'logos', reason: 'unauthorized', request, requestedPath });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (hasTraversal(filePathArray)) {
    logDeniedAssetAccess({ kind: 'logos', reason: 'path_traversal', request, requestedPath, workspaceId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!isWorkspaceNamespaced(filePathArray, workspaceId)) {
    logDeniedAssetAccess({
      kind: 'logos',
      reason: 'workspace_namespace_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const relativePath = `/logos/${filePathArray.join('/')}`;
  const [profileLogo, clientLogo] = await Promise.all([
    prisma.businessProfile.findFirst({
      where: { workspaceId, logoUrl: relativePath },
      select: { workspaceId: true },
    }),
    prisma.client.findFirst({
      where: { workspaceId, logoUrl: relativePath },
      select: { id: true },
    }),
  ]);

  if (!profileLogo && !clientLogo) {
    logDeniedAssetAccess({
      kind: 'logos',
      reason: 'ownership_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  return servePrivateAsset('logos', filePathArray);
}

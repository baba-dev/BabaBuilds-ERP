import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasTraversal, logDeniedAssetAccess } from '@/lib/security/private-asset';
import { servePrivateFile } from '@/lib/uploads/private-storage';

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  const resolvedParams = await params;
  const filePathArray = resolvedParams.path || [];
  const requestedPath = filePathArray.join('/');

  if (!workspaceId) {
    logDeniedAssetAccess({ kind: 'receipts', reason: 'unauthorized', request, requestedPath });
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (hasTraversal(filePathArray)) {
    logDeniedAssetAccess({ kind: 'receipts', reason: 'path_traversal', request, requestedPath, workspaceId });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Expected layout: /uploads/share-target/<workspaceId>/<uploadId>/<filename>
  if (filePathArray[0] !== workspaceId) {
    logDeniedAssetAccess({
      kind: 'receipts',
      reason: 'workspace_namespace_mismatch',
      request,
      requestedPath,
      workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const relativePath = `/uploads/share-target/${filePathArray.join('/')}`;
  // Share-target files are staged imports and currently tracked in a tmp JSON payload.
  // Workspace namespacing is enforced above; this route intentionally avoids DB coupling.
  void relativePath;

  return servePrivateFile('share-target', filePathArray);
}


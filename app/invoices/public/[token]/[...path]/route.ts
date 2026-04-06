import { NextResponse } from 'next/server';
import {
  hasTraversal,
  logDeniedAssetAccess,
  serveAssetFromPublic,
} from '@/lib/security/private-asset';
import { verifySignedAssetToken } from '@/lib/security/signed-links';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const resolvedParams = await params;
  const token = resolvedParams.token;
  const filePathArray = resolvedParams.path || [];
  const requestedPath = filePathArray.join('/');

  if (hasTraversal(filePathArray)) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'path_traversal',
      request,
      requestedPath,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const verification = verifySignedAssetToken(token);
  if (!verification.ok) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: verification.reason === 'expired' ? 'signature_expired' : 'signature_invalid',
      request,
      requestedPath,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  const tokenPath = verification.payload.path.replace(/^\//, '');
  const requestPath = `invoices/${filePathArray.join('/')}`;
  if (requestPath !== tokenPath) {
    logDeniedAssetAccess({
      kind: 'invoices',
      reason: 'ownership_mismatch',
      request,
      requestedPath,
      workspaceId: verification.payload.workspaceId,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  return serveAssetFromPublic('invoices', filePathArray);
}

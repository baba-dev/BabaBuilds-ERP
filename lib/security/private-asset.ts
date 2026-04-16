import path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { promises as fs } from 'fs';
import { buildPrivatePath, type PrivateAssetKind } from '@/lib/uploads/private-storage';

export type AssetKind = 'receipts' | 'logos' | 'invoices' | 'documents';

type DeniedReason =
  | 'unauthorized'
  | 'path_traversal'
  | 'workspace_namespace_mismatch'
  | 'ownership_mismatch'
  | 'signature_invalid'
  | 'signature_expired';

export function logDeniedAssetAccess(args: {
  kind: AssetKind;
  reason: DeniedReason;
  request: Request;
  requestedPath: string;
  workspaceId?: string;
}) {
  const ip =
    args.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    args.request.headers.get('x-real-ip') ||
    'unknown';

  console.warn(
    '[AUDIT] Asset access denied',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      kind: args.kind,
      reason: args.reason,
      requestedPath: args.requestedPath,
      workspaceId: args.workspaceId ?? null,
      ip,
      userAgent: args.request.headers.get('user-agent') || 'unknown',
    })
  );
}

export async function getSessionWorkspaceId() {
  const session = await getServerSession(authOptions);
  return (session as { workspaceId?: string } | null)?.workspaceId;
}

export function hasTraversal(pathSegments: string[]) {
  return pathSegments.some((segment) => segment.includes('..'));
}

export function isWorkspaceNamespaced(pathSegments: string[], workspaceId: string) {
  return pathSegments[0] === workspaceId;
}

export function getFileContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export async function servePrivateAsset(kind: AssetKind, pathSegments: string[]) {
  // kind is aligned with our private storage kinds.
  const filePath = buildPrivatePath(kind satisfies PrivateAssetKind, pathSegments);

  try {
    const fileBuffer = await fs.readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': getFileContentType(filePath),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code === 'ENOENT') {
      return new NextResponse('Not Found', { status: 404 });
    }
    console.error('Failed to read private asset', { kind, pathSegments, error: err });
    return new NextResponse('Not Found', { status: 404 });
  }
}

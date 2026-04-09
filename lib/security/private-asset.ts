import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export type AssetKind = 'receipts' | 'logos' | 'invoices';

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
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export function serveAssetFromPublic(kind: AssetKind, pathSegments: string[]) {
  const filePath = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    'public',
    kind,
    ...pathSegments
  );

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': getFileContentType(filePath),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

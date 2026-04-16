import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireModule } from '@/lib/modules';
import { withPermission } from '@/lib/rbac';
import { getWorkspaceQuotaSnapshot } from '@/lib/documents/quota';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session || !workspaceId || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireModule(workspaceId, 'DOCUMENTS');
  } catch {
    return NextResponse.json({ enabled: false }, { status: 200 });
  }

  const perm = await withPermission(userId, workspaceId, 'documents.view');
  if (!perm.granted) return perm.response;

  const { searchParams } = new URL(request.url);
  const addBytes = Number(searchParams.get('addBytes') ?? '0');

  const snapshot = await getWorkspaceQuotaSnapshot(workspaceId);
  const bytesCapTotal = snapshot.bytesCapTotal === Infinity ? null : snapshot.bytesCapTotal;
  const percentUsedTotal =
    bytesCapTotal === null ? 0 : bytesCapTotal <= 0 ? 1 : Math.min(1, snapshot.bytesUsedTotal / bytesCapTotal);
  const threshold =
    bytesCapTotal === null
      ? 'UNLIMITED'
      : percentUsedTotal >= 1
        ? 'FULL'
        : percentUsedTotal >= 0.9
          ? 'WARN_90'
          : percentUsedTotal >= 0.7
            ? 'WARN_70'
            : 'OK';

  const incomingBytes = Number.isFinite(addBytes) ? Math.max(0, addBytes) : 0;
  const canUpload = bytesCapTotal === null ? true : snapshot.bytesUsedTotal + incomingBytes <= bytesCapTotal;

  return NextResponse.json({
    enabled: true,
    bytesUsedTotal: snapshot.bytesUsedTotal,
    bytesCapTotal,
    percentUsedTotal,
    threshold,
    canUpload,
  });
}


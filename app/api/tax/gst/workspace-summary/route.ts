import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { getGstWorkspaceSummary } from '@/lib/tax/gst-workspace-summary';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!workspaceId || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const canView = await checkPermissionSilent(userId, workspaceId, 'tax.view');
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const asOfParam = searchParams.get('asOf');
  const asOf = asOfParam ? new Date(asOfParam) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return NextResponse.json({ error: 'Invalid asOf' }, { status: 400 });
  }

  const summary = await getGstWorkspaceSummary(prisma, workspaceId, asOf);
  return NextResponse.json({ data: summary });
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { getGstWorkspaceSummary } from '@/lib/tax/gst-workspace-summary';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requirePermission(userId, workspaceId, 'tax.view');

    const { searchParams } = new URL(request.url);
    const asOfParam = searchParams.get('asOf');
    const asOf = asOfParam ? new Date(asOfParam) : new Date();
    if (Number.isNaN(asOf.getTime())) {
      return NextResponse.json({ error: 'Invalid asOf' }, { status: 400 });
    }

    const summary = await getGstWorkspaceSummary(prisma, workspaceId, asOf);
    return NextResponse.json({ data: summary });
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }
}

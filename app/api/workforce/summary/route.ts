/**
 * app/api/workforce/summary/route.ts
 * GET — returns headcount KPIs for the dashboard widget
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { isModuleEnabled } from '@/lib/modules';
import { getWorkforceSummary } from '@/lib/workforce/index';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wu = await prisma.workspaceUser.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: { workspaceId: true },
    });
    if (!wu) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    const [moduleEnabled, canView] = await Promise.all([
      isModuleEnabled(wu.workspaceId, 'WORKFORCE'),
      checkPermissionSilent(session.user.id, wu.workspaceId, 'workforce.view'),
    ]);

    if (!moduleEnabled || !canView) {
      return NextResponse.json({ enabled: false });
    }

    const summary = await getWorkforceSummary(wu.workspaceId);
    return NextResponse.json({ enabled: true, ...summary });
  } catch (err) {
    console.error('[workforce/summary]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

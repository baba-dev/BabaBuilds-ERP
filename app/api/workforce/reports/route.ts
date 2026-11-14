/**
 * app/api/workforce/reports/route.ts
 * GET — workforce analytics (headcount trend, attendance, leave utilisation)
 *       ?from=YYYY-MM-DD&to=YYYY-MM-DD  (defaults to the trailing 6 months)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { resolveReportRange } from '@/lib/workforce/report-math';
import { getWorkforceReport } from '@/lib/workforce/reports';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await resolveSessionMembership(session);
    if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 400 });
    const workspaceId = membership.workspaceId;

    try {
      await requireModule(workspaceId, 'WORKFORCE');
      await requirePermission(session.user.id, workspaceId, 'workforce.reports.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { searchParams } = new URL(req.url);
    const range = resolveReportRange(searchParams.get('from'), searchParams.get('to'));
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 });

    const report = await getWorkforceReport(workspaceId, range.from, range.to);
    return NextResponse.json(report);
  } catch (err) {
    console.error('[workforce/reports]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

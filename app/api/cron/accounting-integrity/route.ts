import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { persistAccountingIntegrityRun } from '@/lib/accounting/integrity';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  const runs = [] as Array<{ workspaceId: string; runId: string; violationCount: number }>;

  for (const workspace of workspaces) {
    const result = await persistAccountingIntegrityRun(workspace.id);
    runs.push({
      workspaceId: workspace.id,
      runId: result.runId,
      violationCount: result.violations.length,
    });
  }

  return NextResponse.json({
    success: true,
    checkedAt: new Date().toISOString(),
    workspacesChecked: workspaces.length,
    runs,
  });
}

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
  const failures = [] as Array<{ workspaceId: string; error: string }>;

  for (const workspace of workspaces) {
    try {
      const result = await persistAccountingIntegrityRun(workspace.id);
      runs.push({
        workspaceId: workspace.id,
        runId: result.runId,
        violationCount: result.violations.length,
      });
    } catch (error) {
      failures.push({
        workspaceId: workspace.id,
        error: error instanceof Error ? error.message : 'Unknown integrity run error',
      });
    }
  }

  return NextResponse.json({
    success: failures.length === 0,
    checkedAt: new Date().toISOString(),
    workspacesChecked: runs.length,
    workspaceFailures: failures.length,
    runs,
    failures,
  });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import fs from 'fs/promises';
import path from 'path';

const ACTIVITY_RETENTION_DAYS = Number(process.env.APP_ACTIVITY_LOG_RETENTION_DAYS ?? 90);
const IMPORT_RETENTION_DAYS = Number(process.env.APP_FILE_IMPORT_LOG_RETENTION_DAYS ?? ACTIVITY_RETENTION_DAYS);
const ARCHIVE_DIR = process.env.APP_ACTIVITY_LOG_ARCHIVE_DIR;
const DEMO_CLEANUP_CONFIRMATION_HEADER = 'x-confirm-demo-cleanup';
const DEMO_CLEANUP_CONFIRMATION_QUERY_PARAM = 'confirmDemoCleanup';
const DRY_RUN_HEADER = 'x-cleanup-dry-run';
const DRY_RUN_QUERY_PARAM = 'dryRun';

const parseDays = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

const isTruthy = (value: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

function isDryRun(request: Request): boolean {
  const url = new URL(request.url);
  return isTruthy(url.searchParams.get(DRY_RUN_QUERY_PARAM)) || isTruthy(request.headers.get(DRY_RUN_HEADER));
}

function hasDemoCleanupConfirmation(request: Request): boolean {
  const url = new URL(request.url);
  return (
    isTruthy(url.searchParams.get(DEMO_CLEANUP_CONFIRMATION_QUERY_PARAM)) ||
    isTruthy(request.headers.get(DEMO_CLEANUP_CONFIRMATION_HEADER))
  );
}

const buildDemoWorkspaceDeleteWhere = (now: Date) => ({
  isDemo: true,
  demoExpiresAt: { lt: now },
  demoTemplateKey: { not: null },
});

async function appendArchive(fileName: string, rows: unknown[]) {
  if (!ARCHIVE_DIR || rows.length === 0) return;
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  const file = path.join(ARCHIVE_DIR, fileName);
  const payload = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fs.appendFile(file, payload, 'utf8');
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const dryRun = isDryRun(request);
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !hasDemoCleanupConfirmation(request)) {
    return NextResponse.json(
      {
        error: 'Missing cleanup confirmation guard. Set X-Confirm-Demo-Cleanup: true or ?confirmDemoCleanup=true.',
      },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const demoDeleteWhere = buildDemoWorkspaceDeleteWhere(now);

    const [candidateCount, oldestCandidate] = await Promise.all([
      prisma.workspace.count({ where: demoDeleteWhere }),
      prisma.workspace.findFirst({
        where: demoDeleteWhere,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const activityRetentionCutoff = new Date(Date.now() - parseDays(ACTIVITY_RETENTION_DAYS, 90) * 24 * 60 * 60 * 1000);
    const importRetentionCutoff = new Date(Date.now() - parseDays(IMPORT_RETENTION_DAYS, 90) * 24 * 60 * 60 * 1000);

    const [oldTaxOverrideLogs, oldTaxDecisionLogs, oldImportLogs] = await Promise.all([
      prisma.taxRateOverrideAuditLog.findMany({ where: { createdAt: { lt: activityRetentionCutoff } } }),
      prisma.taxDecisionAuditLog.findMany({ where: { createdAt: { lt: activityRetentionCutoff } } }),
      prisma.fileImportAuditLog.findMany({ where: { createdAt: { lt: importRetentionCutoff } } }),
    ]);

    const preview = {
      candidateCount,
      oldestCreatedAt: oldestCandidate?.createdAt?.toISOString() ?? null,
      dryRun,
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: 'Dry run complete. No rows were deleted.',
        preview,
        retention: {
          activityLogRetentionDays: parseDays(ACTIVITY_RETENTION_DAYS, 90),
          fileImportLogRetentionDays: parseDays(IMPORT_RETENTION_DAYS, 90),
        },
        logs: {
          taxRateOverrideAuditCandidates: oldTaxOverrideLogs.length,
          taxDecisionAuditCandidates: oldTaxDecisionLogs.length,
          fileImportAuditCandidates: oldImportLogs.length,
        },
        archivedTo: ARCHIVE_DIR ?? null,
      });
    }

    const deleted = await prisma.workspace.deleteMany({ where: demoDeleteWhere });

    await Promise.all([
      appendArchive('tax-override-audit.ndjson', oldTaxOverrideLogs),
      appendArchive('tax-decision-audit.ndjson', oldTaxDecisionLogs),
      appendArchive('file-import-audit.ndjson', oldImportLogs),
    ]);

    const [deletedTaxOverrideLogs, deletedTaxDecisionLogs, deletedImportLogs] = await Promise.all([
      prisma.taxRateOverrideAuditLog.deleteMany({ where: { createdAt: { lt: activityRetentionCutoff } } }),
      prisma.taxDecisionAuditLog.deleteMany({ where: { createdAt: { lt: activityRetentionCutoff } } }),
      prisma.fileImportAuditLog.deleteMany({ where: { createdAt: { lt: importRetentionCutoff } } }),
    ]);

    console.log(`🧹 Cleanup Cron: Purged ${deleted.count} stale demo workspaces.`);

    return NextResponse.json({
      success: true,
      message: 'Old demos and logs purged successfully.',
      purgedCount: deleted.count,
      preview,
      retention: {
        activityLogRetentionDays: parseDays(ACTIVITY_RETENTION_DAYS, 90),
        fileImportLogRetentionDays: parseDays(IMPORT_RETENTION_DAYS, 90),
      },
      logs: {
        taxRateOverrideAuditDeleted: deletedTaxOverrideLogs.count,
        taxDecisionAuditDeleted: deletedTaxDecisionLogs.count,
        fileImportAuditDeleted: deletedImportLogs.count,
      },
      archivedTo: ARCHIVE_DIR ?? null,
    });
  } catch (error) {
    console.error('Cleanup Cron Error:', error);
    return NextResponse.json({ error: 'Failed to purge old demos' }, { status: 500 });
  }
}

export const __testables = {
  buildDemoWorkspaceDeleteWhere,
  hasDemoCleanupConfirmation,
  isDryRun,
};

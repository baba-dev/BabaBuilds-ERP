import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import fs from 'fs/promises';
import path from 'path';

const ACTIVITY_RETENTION_DAYS = Number(process.env.APP_ACTIVITY_LOG_RETENTION_DAYS ?? 90);
const IMPORT_RETENTION_DAYS = Number(process.env.APP_FILE_IMPORT_LOG_RETENTION_DAYS ?? ACTIVITY_RETENTION_DAYS);
const ARCHIVE_DIR = process.env.APP_ACTIVITY_LOG_ARCHIVE_DIR;

const parseDays = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

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

  try {
    const url = new URL(request.url);
    const dryRun =
      request.headers.get('x-cleanup-dry-run') === 'true' || url.searchParams.get('dryRun') === 'true';
    const confirmDemoCleanup =
      request.headers.get('x-confirm-demo-cleanup') === 'true' ||
      url.searchParams.get('confirmDemoCleanup') === 'true';

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !confirmDemoCleanup) {
      return NextResponse.json(
        {
          error:
            'Production safeguard: set x-confirm-demo-cleanup=true (or ?confirmDemoCleanup=true) to allow demo deletions.',
        },
        { status: 400 },
      );
    }

    const where = {
      isDemo: true,
      demoExpiresAt: { lt: new Date() },
    } as const;

    const candidateCount = await prisma.workspace.count({ where });
    const oldest = await prisma.workspace.findFirst({
      where: {
        ...where,
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        candidates: {
          count: candidateCount,
          oldestCreatedAt: oldest?.createdAt ?? null,
        },
      });
    }

    const deleted = await prisma.workspace.deleteMany({
      where,
    });

    const activityRetentionCutoff = new Date(Date.now() - parseDays(ACTIVITY_RETENTION_DAYS, 90) * 24 * 60 * 60 * 1000);
    const importRetentionCutoff = new Date(Date.now() - parseDays(IMPORT_RETENTION_DAYS, 90) * 24 * 60 * 60 * 1000);

    const [oldTaxOverrideLogs, oldTaxDecisionLogs, oldImportLogs] = await Promise.all([
      prisma.taxRateOverrideAuditLog.findMany({ where: { createdAt: { lt: activityRetentionCutoff } } }),
      prisma.taxDecisionAuditLog.findMany({ where: { createdAt: { lt: activityRetentionCutoff } } }),
      prisma.fileImportAuditLog.findMany({ where: { createdAt: { lt: importRetentionCutoff } } }),
    ]);

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
      candidates: {
        count: candidateCount,
        oldestCreatedAt: oldest?.createdAt ?? null,
      },
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

import { prisma } from '@/lib/prisma';
import { buildReportFilename, buildReportWorkbook } from '@/lib/reporting/export-xlsx';
import { executeReportingQuery } from '@/lib/reporting/sql-executor';
import { getReportPreset, validatePresetFilters } from '@/lib/reporting/presets';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.export');
    const body = (await req.json()) as { presetId?: string; filters?: unknown };

    const preset = body.presetId ? getReportPreset(body.presetId) : null;
    if (!preset) throw new Error('PRESET_NOT_FOUND');

    let filters;
    try {
      filters = validatePresetFilters(preset, body.filters);
    } catch {
      throw new Error('INVALID_FILTERS');
    }

const params: Record<string, unknown> = {
  workspaceId,
  fromDate: filters.fromDate ? new Date(filters.fromDate) : undefined,
  toDate: filters.toDate ? new Date(filters.toDate) : undefined,
  status: filters.status,
  limit: filters.limit,
};

const [result, workspace] = await Promise.all([
  executeReportingQuery(preset.sql, params),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    ]);

    const generatedAt = new Date();
    const buffer = await buildReportWorkbook({
      reportTitle: preset.title,
      workspaceName: workspace?.name ?? 'Workspace',
      generatedAt,
      methodology: preset.methodology,
      accountingPolicyRefs: preset.accountingPolicyRefs,
      rows: result.rows,
      columns: preset.columns,
    });

    const filename = buildReportFilename(preset.id, generatedAt);

    await prisma.appActivityLog.create({
      data: {
        workspaceId,
        actorUserId: userId,
        action: 'REPORTING_PRESET_EXPORT',
        entityType: 'REPORT_PRESET',
        entityId: preset.id,
        status: 'SUCCESS',
        metadata: { presetId: preset.id, durationMs: result.durationMs, rowCount: result.rows.length },
      },
    });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

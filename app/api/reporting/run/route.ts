import { prisma } from '@/lib/prisma';
import { executeReportingQuery } from '@/lib/reporting/sql-executor';
import { getReportPreset, validatePresetFilters } from '@/lib/reporting/presets';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.query.run');
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

    const { rows, durationMs } = await executeReportingQuery(preset.sql, params);

    await prisma.appActivityLog.create({
      data: {
        workspaceId,
        actorUserId: userId,
        action: 'REPORTING_PRESET_RUN',
        entityType: 'REPORT_PRESET',
        entityId: preset.id,
        status: 'SUCCESS',
        metadata: { presetId: preset.id, durationMs, rowCount: rows.length },
      },
    });

    return Response.json({
      preset: {
        id: preset.id,
        title: preset.title,
        columns: preset.columns,
        methodology: preset.methodology,
        accountingPolicyRefs: preset.accountingPolicyRefs,
      },
      rows,
      meta: { durationMs, rowCount: rows.length, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

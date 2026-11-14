import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getReport, reportAllowed } from '@/lib/reporting/engine';
import { FORMATS, FREQUENCIES, nextRunAfter, parseRecipients, sanitizeParams, validTimeZone, viewSelect, type Frequency } from '@/lib/reporting/views';
import { validateSpec } from '@/lib/reporting/semantic';
import { logActivity } from '@/lib/security/activity-log';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';
import type { Prisma } from '@prisma/client';

/** Saved reports this person can see: everything shared with the workspace plus their own private ones. */
export async function GET() {
  try {
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.view');
    const views = await prisma.reportView.findMany({ where: { workspaceId, OR: [{ visibility: 'WORKSPACE' }, { createdByUserId: userId }] }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 200, select: viewSelect });
    return Response.json({ views }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

const scheduleFields = {
  scheduleFrequency: z.enum(FREQUENCIES).nullish(), scheduleRecipients: z.string().max(500).nullish(), scheduleFormat: z.enum(FORMATS).optional(),
  scheduleEnabled: z.boolean().optional(), scheduleHour: z.number().int().min(0).max(23).optional(), scheduleTz: z.string().max(60).optional(),
};
const createSchema = z.object({
  name: z.string().trim().min(1).max(80), reportId: z.string().min(1).max(60), params: z.unknown().optional(), pinned: z.boolean().optional(),
  visibility: z.enum(['PRIVATE', 'WORKSPACE']).optional(), pinnedToDashboard: z.boolean().optional(), ...scheduleFields,
});

export async function POST(req: Request) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.query.run');
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    const def = parsed.success ? getReport(parsed.data.reportId) : null;
    if (!parsed.success || !def) throw new Error('INVALID_INPUT');
    if (!(await reportAllowed(def, userId, workspaceId))) throw new Error('FORBIDDEN');
    const d = parsed.data;
    const params = sanitizeParams(d.params);
    if (def.id === 'custom' && !validateSpec(params.spec).ok) throw new Error('INVALID_INPUT');
    let recipients: string | null = null;
    if (d.scheduleFrequency) {
      const list = parseRecipients(d.scheduleRecipients);
      if (!list) throw new Error('INVALID_INPUT');
      recipients = list.join(', ');
    }
    const tz = d.scheduleTz ? validTimeZone(d.scheduleTz) : 'UTC';
    if (!tz) throw new Error('INVALID_INPUT');
    if ((await prisma.reportView.count({ where: { workspaceId } })) >= 100) throw new Error('INVALID_INPUT');
    const view = await prisma.reportView.create({
      data: {
        workspaceId, createdByUserId: userId, name: d.name, reportId: d.reportId, paramsJson: params as Prisma.InputJsonValue, pinned: d.pinned ?? false, visibility: d.visibility ?? 'WORKSPACE', pinnedToDashboard: d.pinnedToDashboard ?? false,
        scheduleFrequency: d.scheduleFrequency ?? null, scheduleRecipients: recipients, scheduleFormat: d.scheduleFormat ?? 'CSV', scheduleEnabled: d.scheduleEnabled ?? true, scheduleHour: d.scheduleHour ?? 7, scheduleTz: tz,
        scheduleNextAt: d.scheduleFrequency ? nextRunAfter(d.scheduleFrequency as Frequency, new Date(), { hour: d.scheduleHour ?? 7, tz }) : null,
      },
      select: viewSelect,
    });
    void logActivity({ workspaceId, action: 'reporting.view_saved', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'report_view', id: view.id }, metadata: { reportId: d.reportId, scheduled: !!d.scheduleFrequency } });
    return Response.json({ view }, { status: 201 });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getReport } from '@/lib/reporting/engine';
import { FREQUENCIES, nextRunAfter, parseRecipients, sanitizeParams, viewSelect, type Frequency } from '@/lib/reporting/views';
import { logActivity } from '@/lib/security/activity-log';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';
import type { Prisma } from '@prisma/client';

/** Saved reports for the workspace. Everyone with view access sees them; only the creator (or someone who can export) changes them. */
export async function GET() {
  try {
    const { workspaceId } = await resolveReportingContext('reporting_center.view');
    const views = await prisma.reportView.findMany({ where: { workspaceId }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 200, select: viewSelect });
    return Response.json({ views }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80), reportId: z.string().min(1).max(60), params: z.unknown().optional(), pinned: z.boolean().optional(),
  scheduleFrequency: z.enum(FREQUENCIES).nullish(), scheduleRecipients: z.string().max(500).nullish(),
});

export async function POST(req: Request) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.query.run');
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !getReport(parsed.data.reportId)) throw new Error('INVALID_INPUT');
    const d = parsed.data;
    let recipients: string | null = null;
    if (d.scheduleFrequency) {
      const list = parseRecipients(d.scheduleRecipients);
      if (!list) throw new Error('INVALID_INPUT');
      recipients = list.join(', ');
    }
    if ((await prisma.reportView.count({ where: { workspaceId } })) >= 100) throw new Error('INVALID_INPUT');
    const view = await prisma.reportView.create({
      data: { workspaceId, createdByUserId: userId, name: d.name, reportId: d.reportId, paramsJson: sanitizeParams(d.params) as Prisma.InputJsonValue, pinned: d.pinned ?? false, scheduleFrequency: d.scheduleFrequency ?? null, scheduleRecipients: recipients, scheduleNextAt: d.scheduleFrequency ? nextRunAfter(d.scheduleFrequency as Frequency, new Date()) : null },
      select: viewSelect,
    });
    void logActivity({ workspaceId, action: 'reporting.view_saved', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'report_view', id: view.id }, metadata: { reportId: d.reportId, scheduled: !!d.scheduleFrequency } });
    return Response.json({ view }, { status: 201 });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

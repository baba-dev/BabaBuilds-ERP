import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { FREQUENCIES, nextRunAfter, parseRecipients, sanitizeParams, viewSelect, type Frequency } from '@/lib/reporting/views';
import { logActivity } from '@/lib/security/activity-log';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';
import type { Prisma } from '@prisma/client';

type Ctx = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(), pinned: z.boolean().optional(), params: z.unknown().optional(),
  scheduleFrequency: z.enum(FREQUENCIES).nullable().optional(), scheduleRecipients: z.string().max(500).nullish(),
});

async function owned(workspaceId: string, userId: string, id: string) {
  const v = await prisma.reportView.findFirst({ where: { id, workspaceId }, select: { id: true, createdByUserId: true, scheduleRecipients: true } });
  if (!v) throw new Error('VIEW_NOT_FOUND');
  // The person who saved it, or anyone allowed to export, may change or remove it.
  if (v.createdByUserId !== userId && !(await checkPermissionSilent(userId, workspaceId, 'reporting_center.export'))) throw new Error('FORBIDDEN');
  return v;
}

export async function PATCH(req: Request, props: Ctx) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.query.run');
    const { id } = await props.params;
    const cur = await owned(workspaceId, userId, id);
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new Error('INVALID_INPUT');
    const d = parsed.data;
    const data: Prisma.ReportViewUpdateInput = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.pinned !== undefined) data.pinned = d.pinned;
    if (d.params !== undefined) data.paramsJson = sanitizeParams(d.params) as Prisma.InputJsonValue;
    if (d.scheduleFrequency !== undefined) {
      if (d.scheduleFrequency === null) { data.scheduleFrequency = null; data.scheduleNextAt = null; data.scheduleLastError = null; }
      else {
        const list = parseRecipients(d.scheduleRecipients ?? cur.scheduleRecipients);
        if (!list) throw new Error('INVALID_INPUT');
        data.scheduleFrequency = d.scheduleFrequency; data.scheduleRecipients = list.join(', '); data.scheduleNextAt = nextRunAfter(d.scheduleFrequency as Frequency, new Date()); data.scheduleLastError = null;
      }
    }
    const view = await prisma.reportView.update({ where: { id }, data, select: viewSelect });
    void logActivity({ workspaceId, action: 'reporting.view_updated', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'report_view', id }, metadata: { changed: Object.keys(data) } });
    return Response.json({ view });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

export async function DELETE(_req: Request, props: Ctx) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.query.run');
    const { id } = await props.params;
    await owned(workspaceId, userId, id);
    await prisma.reportView.delete({ where: { id } });
    void logActivity({ workspaceId, action: 'reporting.view_deleted', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'report_view', id } });
    return Response.json({ success: true });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

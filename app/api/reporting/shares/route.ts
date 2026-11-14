import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getReport, reportAllowed, runReport } from '@/lib/reporting/engine';
import { hashShareToken, newShareSecret, SHARE_ACTIVE_LIMIT, SHARE_MAX_DAYS } from '@/lib/reporting/shares';
import { PERIOD_KEYS } from '@/lib/expenses/period';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { logActivity } from '@/lib/security/activity-log';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';
import type { Prisma } from '@prisma/client';

const schema = z.object({
  reportId: z.string().min(1).max(60), name: z.string().trim().max(80).optional(),
  period: z.enum(PERIOD_KEYS as [string, ...string[]]).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  compare: z.union([z.boolean(), z.enum(['previous', 'yoy'])]).optional(), spec: z.unknown().optional(),
  expiresInDays: z.number().int().min(1).max(SHARE_MAX_DAYS).default(14),
});

/** Active share links this workspace has made. The secret is never stored, so the link itself is only shown once, when it is made. */
export async function GET() {
  try {
    const { workspaceId } = await resolveReportingContext('reporting_center.export');
    const shares = await prisma.reportShare.findMany({ where: { workspaceId, audience: 'EXTERNAL', scope: 'WORKSPACE', status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, name: true, reportKey: true, expiresAt: true, viewCount: true, lastViewedAt: true, createdAt: true } });
    return Response.json({ shares }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

/** Freeze the report as it is now into a read-only link for someone outside the workspace (bank, investor, accountant). Expires; can be revoked. */
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.export');
    const limit = enforceRouteRateLimit({ request: req, route: '/api/reporting/shares', scope: 'share-create', max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    const def = parsed.success ? getReport(parsed.data.reportId) : null;
    if (!parsed.success || !def) throw new Error('INVALID_INPUT');
    if (!(await reportAllowed(def, userId, workspaceId))) throw new Error('FORBIDDEN');
    if ((await prisma.reportShare.count({ where: { workspaceId, audience: 'EXTERNAL', status: 'ACTIVE' } })) >= SHARE_ACTIVE_LIMIT) throw new Error('INVALID_INPUT');
    const d = parsed.data;
    const result = await runReport(workspaceId, userId, { reportId: d.reportId, period: d.period as never, from: d.from, to: d.to, compare: d.compare, spec: d.spec });
    if (!result) throw new Error('REPORT_NOT_FOUND');
    const secret = newShareSecret(), hash = hashShareToken(secret);
    const expiresAt = new Date(Date.now() + d.expiresInDays * 86_400_000);
    const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true } });
    const share = await prisma.reportShare.create({
      data: {
        scope: 'WORKSPACE', audience: 'EXTERNAL', reportKey: d.reportId, name: d.name || def.title, token: hash, tokenHash: hash, workspaceId, createdByUserId: userId, liveDataEnabled: false, expiresAt,
        snapshots: { create: { workspaceId, includedWorkspaceIds: [workspaceId] as Prisma.InputJsonValue, filtersJson: { period: d.period, from: d.from, to: d.to, compare: d.compare } as Prisma.InputJsonValue, columnsJson: result.columns as unknown as Prisma.InputJsonValue, dateRangeStart: result.range?.from ? new Date(result.range.from) : null, dateRangeEnd: result.range?.to ? new Date(result.range.to) : null, allowDownload: false, generatedPayloadJson: { result, title: d.name || def.title, company: profile?.companyName ?? null, reportId: d.reportId } as unknown as Prisma.InputJsonValue } },
      },
      select: { id: true, expiresAt: true },
    });
    void logActivity({ workspaceId, action: 'reporting.share_created', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'report_share', id: share.id }, metadata: { reportId: d.reportId, expiresAt: expiresAt.toISOString() } });
    const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || new URL(req.url).origin;
    return Response.json({ id: share.id, url: `${origin}/shared-report/${secret}`, expiresAt: share.expiresAt }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}

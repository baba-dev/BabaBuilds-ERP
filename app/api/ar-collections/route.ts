import { NextRequest, NextResponse } from 'next/server';
import { arError, requireArAccess } from '@/lib/ar/access';
import { getArCollectionsSnapshot, markBrokenPromises, runReminderAutomation, type Filters } from '@/lib/ar-collections';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { checkPermissionSilent } from '@/lib/rbac';

const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
const VIEWS = ['all', 'actionable', 'promises', 'broken', 'disputed', 'paused'] as const;

/** The collections workspace: open invoices with their real due dates, base-currency balances, risk and next best action, plus totals, aging and customers. */
export async function GET(request: NextRequest) {
  const auth = await requireArAccess('invoices.view');
  if (!auth.ok) return auth.response;
  const sp = request.nextUrl.searchParams;
  const bucket = sp.get('bucket');
  const view = sp.get('view');
  const filters: Filters = {
    bucket: (BUCKETS as readonly string[]).includes(bucket ?? '') ? (bucket as Filters['bucket']) : undefined,
    view: (VIEWS as readonly string[]).includes(view ?? '') ? (view as Filters['view']) : undefined,
    q: sp.get('q')?.slice(0, 80) || undefined,
    clientId: sp.get('clientId') || undefined,
  };
  try {
    // Promises whose day passed become "broken" here too, so a person opening the page never sees a stale status.
    await markBrokenPromises(auth.ctx.workspaceId);
    const [snapshot, canEdit, canSend] = await Promise.all([
      getArCollectionsSnapshot(auth.ctx.workspaceId, filters),
      checkPermissionSilent(auth.ctx.userId, auth.ctx.workspaceId, 'invoices.edit'),
      checkPermissionSilent(auth.ctx.userId, auth.ctx.workspaceId, 'invoices.send'),
    ]);
    return NextResponse.json({ ...snapshot, canEdit, canSend }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[ar-collections/GET]', error);
    return arError(500, 'AR_FAILED', 'Could not load collections.');
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireArAccess('invoices.send');
  if (!auth.ok) return auth.response;
  const limit = enforceRouteRateLimit({ request, route: '/api/ar-collections', scope: 'run-reminders', max: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) return limit.response;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'RUN_REMINDERS') return arError(400, 'INVALID_ACTION', 'Invalid action');
  try {
    return NextResponse.json(await runReminderAutomation(auth.ctx.workspaceId, { userId: auth.ctx.userId, email: auth.ctx.email }));
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'RATE_LIMIT_COOLDOWN') return arError(429, 'RATE_LIMIT_COOLDOWN', 'Wait before running automation again.');
    console.error('[ar-collections/POST]', e);
    return arError(500, 'AR_FAILED', 'Could not run reminders.');
  }
}

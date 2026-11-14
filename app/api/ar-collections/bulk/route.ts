import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { arError, requireArAccess } from '@/lib/ar/access';
import { sendArReminderEmailForInvoice, setStatus, snooze } from '@/lib/ar-collections';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['remind', 'snooze', 'escalate']),
  days: z.number().int().min(1).max(90).optional(),
});

/** The same follow-up on up to 100 invoices at once. Reminders skip any invoice reminded in the last minute and report who could not be emailed. */
export async function POST(request: NextRequest) {
  const auth = await requireArAccess('invoices.edit');
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return arError(400, 'INVALID_BODY', 'Choose invoices and an action.');
  const { ids, action, days } = parsed.data;
  const actor = { userId, email };
  let ok = 0; const skipped: Array<{ id: string; reason: string }> = [];

  if (action === 'remind') {
    if (!(await checkPermissionSilent(userId, workspaceId, 'invoices.send'))) return arError(403, 'FORBIDDEN', 'You need permission to send reminders.');
    const limit = enforceRouteRateLimit({ request, route: '/api/ar-collections/bulk', scope: 'remind', max: 6, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const recent = await prisma.invoice.findMany({ where: { workspaceId, id: { in: ids }, lastReminderSentAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } });
    const skip = new Set(recent.map((r) => r.id));
    for (const id of ids) {
      if (skip.has(id)) { skipped.push({ id, reason: 'TOO_SOON' }); continue; }
      const res = await sendArReminderEmailForInvoice(workspaceId, id, { actor });
      if (res.ok) ok += 1; else skipped.push({ id, reason: res.code });
    }
  } else {
    for (const id of ids) {
      const res = action === 'snooze' ? await snooze(workspaceId, id, days ?? 7, actor) : await setStatus(workspaceId, id, 'ESCALATED', actor);
      if (res.ok) ok += 1; else skipped.push({ id, reason: res.code });
    }
  }
  return NextResponse.json({ ok, skipped });
}

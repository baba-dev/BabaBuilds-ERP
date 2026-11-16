import { NextRequest, NextResponse } from 'next/server';
import { arError, requireArAccess } from '@/lib/ar/access';
import { addNote, getTimeline, parseFollowUpStatus, recordDispute, recordPromise, resolveDispute, sendArReminderEmailForInvoice, setRisk, setStatus, snooze, type ActionResult } from '@/lib/ar-collections';
import { prisma } from '@/lib/prisma';
import { checkPermissionSilent } from '@/lib/rbac';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

type Ctx = { params: Promise<{ id: string }> };
const REMINDER_COOLDOWN_MS = 60_000;

/** What happened on this invoice: reminders, promises, disputes and notes, newest first. */
export async function GET(_request: NextRequest, props: Ctx) {
  const auth = await requireArAccess('invoices.view');
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const inv = await prisma.invoice.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId }, select: { id: true } });
  if (!inv) return arError(404, 'NOT_FOUND', 'Invoice not found.');
  return NextResponse.json({ data: await getTimeline(auth.ctx.workspaceId, id) }, { headers: { 'Cache-Control': 'no-store' } });
}

const done = (r: ActionResult) => (r.ok ? NextResponse.json({ success: true }) : arError(r.status, r.code, r.message));

/**
 * One follow-up action: remind, promise, dispute, resolve_dispute, note, snooze, escalate, status, risk.
 * The older shape (followUpStatus, sendReminderNow, collectionRiskScore) still works.
 */
export async function PATCH(request: NextRequest, props: Ctx) {
  const auth = await requireArAccess('invoices.edit');
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.ctx;
  const { id } = await props.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return arError(400, 'INVALID_BODY', 'Send the change as JSON.');
  const actor = { userId, email };

  let action = typeof body.action === 'string' ? body.action : '';
  if (!action) action = body.sendReminderNow ? 'remind' : body.followUpStatus !== undefined ? 'status' : body.collectionRiskScore !== undefined ? 'risk' : '';
  try {
    switch (action) {
      case 'remind': {
        if (!(await checkPermissionSilent(userId, workspaceId, 'invoices.send'))) return arError(403, 'FORBIDDEN', 'You need permission to send reminders.');
        const limit = enforceRouteRateLimit({ request, route: '/api/ar-collections/invoices', scope: 'remind', max: 40, windowMs: 10 * 60_000 });
        if (!limit.ok) return limit.response;
        const inv = await prisma.invoice.findFirst({ where: { id, workspaceId }, select: { status: true, lastReminderSentAt: true } });
        if (!inv) return arError(404, 'NOT_FOUND', 'Invoice not found.');
        if (inv.status === 'PAID' || inv.status === 'VOID') return arError(409, 'NOTHING_DUE', 'There is no balance to remind about.');
        if (inv.lastReminderSentAt && Date.now() - inv.lastReminderSentAt.getTime() < REMINDER_COOLDOWN_MS) return arError(429, 'TOO_SOON', 'A reminder was just sent. Wait a minute before sending another.');
        const tone = body.tone === 'friendly' || body.tone === 'firm' || body.tone === 'final' ? body.tone : undefined;
        const res = await sendArReminderEmailForInvoice(workspaceId, id, { tone, actor });
        if (!res.ok) {
          const map = { NOT_FOUND: [404, 'Invoice not found.'], NO_CLIENT_EMAIL: [400, 'This client has no email address on file.'], SMTP_NOT_CONFIGURED: [400, 'Email (SMTP) is not configured in Business Settings.'], SEND_FAILED: [502, 'Failed to send the reminder.'] } as const;
          return arError(map[res.code][0], res.code, map[res.code][1]);
        }
        const follow = body.followUpStatus !== undefined ? parseFollowUpStatus(body.followUpStatus) : null;
        if (follow) await setStatus(workspaceId, id, follow, actor);
        return NextResponse.json({ success: true });
      }
      case 'promise': return done(await recordPromise(workspaceId, id, { date: String(body.date ?? ''), note: typeof body.note === 'string' ? body.note : undefined }, actor));
      case 'dispute': return done(await recordDispute(workspaceId, id, String(body.reason ?? ''), actor));
      case 'resolve_dispute': return done(await resolveDispute(workspaceId, id, actor));
      case 'note': return done(await addNote(workspaceId, id, String(body.note ?? ''), actor));
      case 'snooze': return done(await snooze(workspaceId, id, Number(body.days), actor));
      case 'escalate': return done(await setStatus(workspaceId, id, 'ESCALATED', actor));
      case 'status': {
        const s = parseFollowUpStatus(body.followUpStatus);
        if (!s) return arError(400, 'INVALID_STATUS', 'Invalid follow-up status');
        return done(await setStatus(workspaceId, id, s, actor));
      }
      case 'risk': return done(await setRisk(workspaceId, id, body.collectionRiskScore === null ? null : Number(body.collectionRiskScore), actor));
      default: return arError(400, 'INVALID_ACTION', 'No update provided.');
    }
  } catch (error) {
    console.error('[ar-collections/invoices/PATCH]', error);
    return arError(500, 'AR_FAILED', 'Could not save the change.');
  }
}

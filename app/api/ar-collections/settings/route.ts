import { NextRequest, NextResponse } from 'next/server';
import { arError, requireArAccess } from '@/lib/ar/access';
import { getSettings, saveSettings } from '@/lib/ar-collections';

/** The reminder ladder: when each reminder goes out, how firm it is, and when reminders pause. */
export async function GET() {
  const auth = await requireArAccess('invoices.view');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ data: await getSettings(auth.ctx.workspaceId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: NextRequest) {
  const auth = await requireArAccess('invoices.edit');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return arError(400, 'INVALID_BODY', 'Send the settings as JSON.');
  return NextResponse.json({ data: await saveSettings(auth.ctx.workspaceId, body, { userId: auth.ctx.userId, email: auth.ctx.email }) });
}

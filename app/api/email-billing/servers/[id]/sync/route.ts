import { NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../_lib/auth';
import { syncMailBillingServer } from '@/lib/email-billing/sync';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('workspace.manage_settings');
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const summary = await syncMailBillingServer({ workspaceId: auth.workspaceId, serverId: id, actorUserId: auth.userId, request: req });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error && /timeout|abort/i.test(error.message) ? 'Mail source request timed out' : error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

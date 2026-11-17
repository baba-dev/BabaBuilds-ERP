import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { fetchMailBillingInventory, type MailBillingAccessMode } from '@/lib/email-billing/miab-client';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { miabReadVersion } from '@/lib/email-billing/miab/writes';
import { requireEmailBilling } from '../../../_lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('admin');
  if ('response' in auth) return auth.response;
  const limit = await enforceRouteRateLimit({ request: req, route: '/api/email-billing/servers/test', scope: auth.workspaceId, max: 20, windowMs: 10 * 60_000 });
  if (!limit.ok) return limit.response;
  const { id } = await params;
  const server = await prisma.mailBillingServer.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!server) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const inventory = await fetchMailBillingInventory({ baseUrl: server.baseUrl, accessMode: server.accessMode as MailBillingAccessMode, token: server.encryptedToken ? decrypt(server.encryptedToken) : undefined });
    // In managed mode also confirm the credential and remember the box version (best effort; a failure is not a test failure).
    let miabVersion: string | null = null;
    if (server.accessMode === 'MANAGED_API') {
      miabVersion = await miabReadVersion({ baseUrl: server.baseUrl, token: server.encryptedToken ? decrypt(server.encryptedToken) : undefined }).catch(() => null);
      if (miabVersion) await prisma.mailBillingServer.update({ where: { id }, data: { miabVersion } });
    }
    void logActivity({ workspaceId: auth.workspaceId, action: 'email_billing.server_tested', status: 'SUCCESS', actor: { userId: auth.userId, email: null }, entity: { type: 'mail_billing_server', id } });
    return NextResponse.json({ ok: true, miabVersion, domains: inventory.domains.length, mailboxes: inventory.domains.reduce((n, d) => n + d.mailboxes.length, 0) });
  } catch (error) {
    const message = error instanceof Error && /timeout|abort/i.test(error.message) ? 'Mail source request timed out' : error instanceof Error ? error.message : 'Connection test failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

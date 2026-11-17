import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { logActivity } from '@/lib/security/activity-log';
import { requireEmailBilling } from '../../_lib/auth';
import { validateMailBillingUrl } from '@/lib/email-billing/miab-client';
import { mailBillingServerPatchSchema, parseJsonBody } from '@/lib/email-billing/validation';

type ServerWithRelations = {
  id: string;
  name: string;
  provider: string;
  accessMode: string;
  baseUrl: string;
  encryptedToken: string | null;
  status: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  domains?: unknown;
  mailboxes?: unknown;
  syncRuns?: unknown;
};

const sanitizeServer = (server: ServerWithRelations) => ({
  id: server.id,
  name: server.name,
  provider: server.provider,
  accessMode: server.accessMode,
  baseUrl: server.baseUrl,
  status: server.status,
  lastSyncAt: server.lastSyncAt,
  lastSyncStatus: server.lastSyncStatus,
  lastSyncError: server.lastSyncError,
  hasToken: Boolean(server.encryptedToken),
  domains: server.domains,
  mailboxes: server.mailboxes,
  syncRuns: server.syncRuns,
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const server = await prisma.mailBillingServer.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: {
      _count: { select: { domains: true, mailboxes: true } },
      syncRuns: { orderBy: { startedAt: 'desc' }, take: 10 },
    },
  });

  if (!server) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    server: {
      ...sanitizeServer(server),
      domainCount: server._count.domains,
      mailboxCount: server._count.mailboxes,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('admin');
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.mailBillingServer.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const body = parseJsonBody(mailBillingServerPatchSchema, await req.json().catch(() => ({})));
    const data: {
      name?: string;
      baseUrl?: string;
      accessMode?: 'READ_ONLY_ADAPTER' | 'DIRECT_MIAB_API';
      status?: 'ACTIVE' | 'DISABLED' | 'ERROR';
      encryptedToken?: string | null;
    } = {};

    if (body.name) data.name = body.name;
    if (body.baseUrl) {
      validateMailBillingUrl(body.baseUrl);
      data.baseUrl = body.baseUrl;
    }
    if (body.accessMode) data.accessMode = body.accessMode;
    if (body.status) data.status = body.status;
    if (body.clearToken === true || body.token === '') data.encryptedToken = null;
    else if (body.token && body.token !== 'SET') data.encryptedToken = encrypt(body.token);

    const server = await prisma.mailBillingServer.update({ where: { id }, data });
    void logActivity({ workspaceId: auth.workspaceId, action: 'email_billing.server_updated', status: 'SUCCESS', actor: { userId: auth.userId, email: null }, entity: { type: 'mail_billing_server', id }, metadata: { fields: Object.keys(data).filter((k) => k !== 'encryptedToken'), tokenChanged: 'encryptedToken' in data } });
    return NextResponse.json({ server: sanitizeServer(server) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid server update' },
      { status: 400 },
    );
  }
}

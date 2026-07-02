import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { requireEmailBilling } from '../_lib/auth';
import { validateMailBillingUrl } from '@/lib/email-billing/miab-client';
import { mailBillingServerCreateSchema, parseJsonBody } from '@/lib/email-billing/validation';

type MailBillingServerForApi = {
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
  createdAt: Date;
  updatedAt: Date;
};

const sanitizeServer = (server: MailBillingServerForApi) => ({
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
  createdAt: server.createdAt,
  updatedAt: server.updatedAt,
});

export async function GET() {
  const auth = await requireEmailBilling('invoices.view');
  if ('response' in auth) return auth.response;

  const servers = await prisma.mailBillingServer.findMany({
    where: { workspaceId: auth.workspaceId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ servers: servers.map(sanitizeServer) });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('workspace.manage_settings');
  if ('response' in auth) return auth.response;

  try {
    const body = parseJsonBody(mailBillingServerCreateSchema, await req.json().catch(() => ({})));
    validateMailBillingUrl(body.baseUrl);

    const server = await prisma.mailBillingServer.create({
      data: {
        workspaceId: auth.workspaceId,
        name: body.name ?? 'Mail Server',
        baseUrl: body.baseUrl,
        accessMode: body.accessMode,
        encryptedToken: body.token ? encrypt(body.token) : null,
        status: body.status,
      },
    });

    return NextResponse.json({ server: sanitizeServer(server) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid server configuration' },
      { status: 400 },
    );
  }
}

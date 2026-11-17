import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requireEmailBilling } from '../_lib/auth';
import { OperationError, requestOperation } from '@/lib/email-billing/ops/service';
import { ADMIN_OPERATIONS, operationRequestSchema } from '@/lib/email-billing/ops/schemas';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const params = req.nextUrl.searchParams;
  const status = params.get('status');
  const mailboxId = params.get('mailboxId');
  const operations = await prisma.mailOperation.findMany({
    where: { workspaceId: auth.workspaceId, ...(status ? { status } : {}), ...(mailboxId ? { mailboxId } : {}) },
    include: { mailbox: { select: { email: true } }, domain: { select: { domain: true } }, server: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ operations });
}

/**
 * Requests a change on the mail server. When the operation creates a one-time password (new mailbox, reset, resume) it is
 * returned once in `secret` and is not stored; the response is never cached.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('operate');
  if ('response' in auth) return auth.response;
  const limit = await enforceRouteRateLimit({ request: req, route: '/api/email-billing/operations', scope: auth.workspaceId, max: 60, windowMs: 10 * 60_000 });
  if (!limit.ok) return limit.response;

  const parsed = operationRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') }, { status: 400, headers: NO_STORE });
  }
  if (ADMIN_OPERATIONS.has(parsed.data.type)) {
    const admin = await requireEmailBilling('admin');
    if ('response' in admin) return admin.response;
  }
  try {
    const { operation, secret } = await requestOperation({ workspaceId: auth.workspaceId, userId: auth.userId, input: parsed.data, source: 'UI' });
    const status = operation.status === 'FAILED' ? 422 : 201;
    return NextResponse.json({ operation, ...(secret ? { secret } : {}) }, { status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    console.error('Email hosting operation request failed:', error);
    return NextResponse.json({ error: 'Could not request the operation' }, { status: 500, headers: NO_STORE });
  }
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { commitReconciliationTransactions } from '@/lib/reconciliation/commit';
import { withPermission } from '@/lib/rbac';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !(session as any).workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = (session as any).workspaceId as string;
  const userId = (session as any).user?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const permission = await withPermission(
    userId,
    workspaceId,
    'reconciliation.commit',
  );
  if (!permission.granted) return permission.response;

  const body = await request.json();
  const result = await commitReconciliationTransactions({
    workspaceId,
    actorUserId: userId,
    approvedInvoices: body?.approvedInvoices,
    approvedExpenses: body?.approvedExpenses,
  });

  return NextResponse.json(result.body, { status: result.status });
}

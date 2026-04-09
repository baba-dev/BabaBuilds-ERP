import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { commitReconciliationTransactions } from '@/lib/reconciliation/commit';

/**
 * @deprecated Use POST /api/reconcile/commit instead.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !(session as any).workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const result = await commitReconciliationTransactions({
    workspaceId: (session as any).workspaceId,
    approvedInvoices: body?.approvedInvoices,
    approvedExpenses: body?.approvedExpenses,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      Deprecation: 'true',
      Link: '</api/reconcile/commit>; rel="successor-version"',
    },
  });
}

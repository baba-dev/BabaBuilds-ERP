import { NextResponse } from 'next/server';
import { requireEmailBilling } from '../../../_lib/auth';
import { OperationError, retryOperation } from '@/lib/email-billing/ops/service';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('operate');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const result = await retryOperation({ workspaceId: auth.workspaceId, operationId: id, userId: auth.userId });
    return NextResponse.json({ operation: 'operation' in result ? result.operation : result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof OperationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Email hosting operation retry failed:', error);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}

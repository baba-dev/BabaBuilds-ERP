import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { buildTraceabilityMatrix } from '@/lib/accounting/traceability';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !(session as any).workspaceId) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
  }

  const workspaceId = (session as any).workspaceId as string;
  const rows = await buildTraceabilityMatrix(workspaceId);

  return NextResponse.json({
    workspaceId,
    generatedAt: new Date().toISOString(),
    rows,
  });
}

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { buildTraceabilityMatrix } from '@/lib/accounting/traceability';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';

export async function GET() {
  try {
    await verifySuperAdmin();

    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
    }

    const workspaceId = session.workspaceId as string;
    const rows = await buildTraceabilityMatrix(workspaceId);

    return NextResponse.json({
      workspaceId,
      generatedAt: new Date().toISOString(),
      rows,
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load traceability matrix");
  }
}

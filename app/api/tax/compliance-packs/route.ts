import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { getCompliancePack, getSupportedCompliancePacks } from '@/lib/tax/compliance-packs';
import { taxAdvancedModuleDisabledResponse } from '@/lib/tax/module-gate';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
    }

    const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
    if (moduleDisabledResponse) return moduleDisabledResponse;

    await requirePermission(userId, workspaceId, 'tax.view');

    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get('countryCode');

    if (countryCode) {
      const pack = getCompliancePack(countryCode);
      if (!pack) {
        return NextResponse.json({ error: 'Country pack not found', code: 'COUNTRY_PACK_NOT_FOUND' }, { status: 404 });
      }

      return NextResponse.json({ data: pack });
    }

    return NextResponse.json({ data: getSupportedCompliancePacks() });
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }
}

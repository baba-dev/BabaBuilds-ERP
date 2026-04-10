import { NextResponse } from 'next/server';

import { handleAdminApiError, verifySuperAdmin } from '@/app/api/admin/authz';
import { buildPrivilegedAccessControlReport } from '@/lib/security/segregation-of-duties';

export async function GET(request: Request) {
  try {
    await verifySuperAdmin();

    const { searchParams } = new URL(request.url);
    const managerUserId = searchParams.get('managerUserId') ?? 'unassigned_manager';

    const report = buildPrivilegedAccessControlReport(managerUserId);

    return NextResponse.json({ data: report });
  } catch (error) {
    return handleAdminApiError(error, 'Failed to build access control report');
  }
}

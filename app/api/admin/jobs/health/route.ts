import { NextResponse } from 'next/server';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';
import { getJobHealth } from '@/lib/jobs/ops-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await verifySuperAdmin();
    return NextResponse.json(await getJobHealth(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return handleAdminApiError(error, 'Job health unavailable');
  }
}

import { NextResponse } from 'next/server';
import { verifySuperAdmin, handleAdminApiError } from '@/app/api/admin/authz';
import { getRedisHealth } from '@/lib/redis/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Superadmin-only, non-mutating Redis diagnostics; never publishes secrets. */
export async function GET() {
  try {
    await verifySuperAdmin();
    const health = await getRedisHealth();
    // This is an admin diagnostic, not a readiness gate. Even when Redis is
    // unavailable, the ERP web/API and PostgreSQL remain independently usable.
    return NextResponse.json(health, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return handleAdminApiError(error, 'Redis diagnostics unavailable');
  }
}

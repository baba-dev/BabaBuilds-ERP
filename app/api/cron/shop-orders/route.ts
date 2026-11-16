/**
 * GET /api/cron/shop-orders
 *
 * Daily job: closes checkouts that were abandoned for over 24 hours, reminds the owner about paid orders still unshipped after
 * two days, and about orders waiting for a refund.
 *
 *   20 7 * * * curl -s https://yourdomain.com/api/cron/shop-orders -H "Authorization: Bearer $CRON_SECRET"
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runShopMaintenance } from '@/lib/shop/maintenance-job';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    return NextResponse.json({ ok: true, ...(await runShopMaintenance()) });
  } catch (error) {
    console.error('Shop orders cron error:', error);
    return NextResponse.json({ error: 'Shop orders job failed' }, { status: 500 });
  }
}

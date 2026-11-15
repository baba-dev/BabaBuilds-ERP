/**
 * GET /api/cron/inventory-alerts
 *
 * Daily job: out-of-stock (Mon, Thu) and low-stock (Mon) digests, and a nudge when a supplier is late with a purchase order.
 *
 *   30 7 * * * curl -s https://yourdomain.com/api/cron/inventory-alerts -H "Authorization: Bearer $CRON_SECRET"
 */
import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runInventoryAlerts } from '@/lib/inventory/alerts-job';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  try {
    return NextResponse.json({ ok: true, ...(await runInventoryAlerts()) });
  } catch (error) {
    console.error('Inventory alerts cron error:', error);
    return NextResponse.json({ error: 'Inventory alerts failed' }, { status: 500 });
  }
}

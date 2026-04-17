import { NextResponse } from 'next/server';
import { runTaxObligationScheduler } from '@/lib/compliance/tax-obligation-scheduler';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    const result = await runTaxObligationScheduler();

    return NextResponse.json({
      message: 'Tax obligation cron complete',
      ...result,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[cron/tax-obligations]', error);
    return NextResponse.json(
      { error: 'Tax obligation cron failed', detail },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { syncFallbackRates } from '@/scripts/tax/sync-fallback-rates';

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized Cron Trigger', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedApply = searchParams.get('apply') === '1';
  const approved = searchParams.get('approve') === '1' || process.env.TAX_RULES_SYNC_APPROVED === '1';

  // Production guardrail: never auto-apply unless explicitly approved.
  const dryRun = process.env.NODE_ENV === 'production' ? !requestedApply || !approved : !requestedApply;

  try {
    const report = await syncFallbackRates({ dryRun, approve: approved });

    return NextResponse.json({
      success: true,
      mode: dryRun ? 'dry-run' : 'apply',
      approvalRequired: !approved,
      report,
      message: dryRun
        ? 'Dry run complete. Review diff report and re-run with apply=1&approve=1 after explicit approval.'
        : 'Tax fallback rules updated after explicit approval.',
    });
  } catch (error) {
    console.error('Tax rules sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Tax rules sync failed',
      },
      { status: 500 }
    );
  }
}

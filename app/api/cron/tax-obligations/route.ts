import { NextResponse } from 'next/server';
import { runTaxObligationScheduler } from '@/lib/compliance/tax-obligation-scheduler';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
    const shardTotalRaw = process.env.TAX_CRON_SHARD_TOTAL;
    const shardIndexRaw = process.env.TAX_CRON_SHARD_INDEX;
    const shardTotal = shardTotalRaw ? parseInt(shardTotalRaw, 10) : NaN;
    const shardIndex = shardIndexRaw ? parseInt(shardIndexRaw, 10) : NaN;
    const sharding =
      Number.isFinite(shardTotal) &&
      shardTotal > 0 &&
      Number.isFinite(shardIndex) &&
      shardIndex >= 0 &&
      shardIndex < shardTotal
        ? { shardTotal, shardIndex }
        : {};

    const startedAt = Date.now();
    const result = await runTaxObligationScheduler({
      ...(sharding as { shardTotal: number; shardIndex: number }),
    });

    const durationMs = Date.now() - startedAt;
    console.info(
      JSON.stringify({
        msg: 'tax_obligations_cron_complete',
        durationMs,
        sharding: Object.keys(sharding).length ? sharding : null,
        ...result,
      }),
    );

    return NextResponse.json({
      message: 'Tax obligation cron complete',
      ...sharding,
      ...result,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ msg: 'tax_obligations_cron_failed', detail }));
    return NextResponse.json(
      { error: 'Tax obligation cron failed', detail },
      { status: 500 },
    );
  }
}

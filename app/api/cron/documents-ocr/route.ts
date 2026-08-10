import { NextResponse } from 'next/server';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';
import { runQueuedOcrJobs } from '@/lib/documents/ocr/runner';
import { getOcrCapability, toOcrCapabilityResponse } from '@/lib/documents/ocr/providers';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const capability = getOcrCapability();
  if (!capability.enabled) {
    return NextResponse.json(
      {
        ok: false,
        error: capability.message,
        code: capability.code,
        capabilities: { ocr: toOcrCapabilityResponse(capability) },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit') ?? '10')));

    const result = await runQueuedOcrJobs({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/documents-ocr]', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

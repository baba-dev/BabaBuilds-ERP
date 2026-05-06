import { NextResponse } from 'next/server';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function isLocalDevAllowlisted(request: Request): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }
  if (process.env.CRON_DEV_ORIGIN_BYPASS !== 'true') {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return false;
  }

  try {
    const { hostname } = new URL(origin);
    return LOCALHOST_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

export function isCronAuthorized(request: Request): boolean {
  if (isLocalDevAllowlisted(request)) {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

export function unauthorizedCronResponse(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Note: The user hasn't generated the CrowdSec keys yet. We will fail open if no key is present.
export async function proxy(request: NextRequest) {
  const bouncerUrl = process.env.CROWDSEC_LAPI_URL || 'http://localhost:8080';
  const apiKey = process.env.CROWDSEC_BOUNCER_KEY;

  if (apiKey) {
    try {
      const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
      
      // Simple manual fetch to CrowdSec LAPI for Bouncer verification
      const res = await fetch(`${bouncerUrl}/v1/decisions?ip=${ip}`, {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        // Don't hang the app if CrowdSec is down
        signal: AbortSignal.timeout(1000) 
      });

      if (res.ok) {
        const decisions = await res.json();
        // If there's an active decision to ban this IP
        if (decisions && decisions.length > 0) {
           const ban = decisions.find((d: any) => d.type === 'ban');
           if (ban) {
             return new NextResponse("Forbidden - Access blocked by IPS.", { status: 403 });
           }
        }
      }
    } catch (e) {
       // Fail open if CrowdSec LAPI is unreachable to avoid taking down the SaaS
       console.error("CrowdSec Middleware Error:", e);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|logos|receipts|favicon.ico).*)'],
};

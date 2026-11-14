import { NextResponse } from "next/server";
import { isCronAuthorized, unauthorizedCronResponse } from "@/lib/security/cron-auth";
import { runDueRecurring, runPayablesDigests } from "@/lib/expenses/automation";

/** Daily: posts recurring expenses that have come due and sends each workspace its "bills to pay" digest. Schedule it like the other cron routes. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();
  const now = new Date();
  const [recurring, digests] = await Promise.all([runDueRecurring(now), runPayablesDigests(now)]);
  return NextResponse.json({ ok: true, recurring, digests }, { headers: { "Cache-Control": "no-store" } });
}

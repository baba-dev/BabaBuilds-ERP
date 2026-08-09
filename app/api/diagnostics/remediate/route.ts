import { NextResponse } from "next/server";

/**
 * Permanently retired. Remediation approval lives under the super-admin API and
 * this web process never executes code, patches, or operating-system commands.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

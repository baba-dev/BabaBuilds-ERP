import { NextResponse } from "next/server";

/** Disabled at both the application and reverse-proxy layers. */
export async function POST() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

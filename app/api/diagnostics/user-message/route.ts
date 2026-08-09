import { NextResponse } from "next/server";

/** Disabled to prevent anonymous diagnostic/LLM ingestion and cost abuse. */
export async function POST() {
  return NextResponse.json(
    {
      error: "Not found",
      friendlyMessage: "We hit an unexpected error. Please try again or contact support.",
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

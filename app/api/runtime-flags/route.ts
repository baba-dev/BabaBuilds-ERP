import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      dashboardIslands: process.env.NEXT_PUBLIC_DASHBOARD_ISLANDS === "true",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

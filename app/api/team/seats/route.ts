/**
 * app/api/team/seats/route.ts
 *
 * Returns current seat availability data for the Seats / Plan tab.
 * Includes active members, pending invites, and plan limits.
 * Any authenticated workspace member can view seat info.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { checkSeatAvailability } from "@/lib/rbac";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.workspaceId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const seats = await checkSeatAvailability(session.workspaceId);

    return NextResponse.json({ data: seats });
  } catch (err) {
    console.error("[team/seats] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

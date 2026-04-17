import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getTaxReadinessSummary } from "@/lib/tax/return-prep";

type SessionWithWorkspace = {
  workspaceId?: string | null;
};

export async function GET() {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    const workspaceId = session?.workspaceId;

    if (!workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await getTaxReadinessSummary(workspaceId);
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error("Tax readiness summary failed", error);
    return NextResponse.json({ error: "Failed to load tax readiness summary." }, { status: 500 });
  }
}

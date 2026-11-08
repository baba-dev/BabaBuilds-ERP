import { NextResponse } from "next/server";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { getRetainerSummary } from "@/lib/retainers/summary";

export async function GET() {
  const auth = await requireRetainerAccess("retainers.view");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getRetainerSummary(auth.access.workspaceId));
  } catch (error) {
    console.error("Retainer summary error:", error);
    return retainerError(500, "SUMMARY_FAILED", "Failed to load the retainer summary.");
  }
}

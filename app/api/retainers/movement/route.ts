import { NextResponse } from "next/server";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { getMrrMovement } from "@/lib/retainers/movement";

export async function GET(request: Request) {
  const auth = await requireRetainerAccess("retainers.view");
  if (!auth.ok) return auth.response;
  const months = Math.min(24, Math.max(3, Number(new URL(request.url).searchParams.get("months")) || 12));
  try {
    return NextResponse.json({ data: await getMrrMovement(auth.access.workspaceId, months) });
  } catch (error) {
    console.error("MRR movement error:", error);
    return retainerError(500, "MOVEMENT_FAILED", "Failed to load MRR movement.");
  }
}

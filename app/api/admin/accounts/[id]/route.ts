import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { loadAccountDetail } from "@/lib/admin/accounts";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await verifySuperAdmin();
    const { id } = await ctx.params;
    const detail = await loadAccountDetail(id);
    if (!detail) return NextResponse.json({ error: "Workspace not found", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load the workspace");
  }
}

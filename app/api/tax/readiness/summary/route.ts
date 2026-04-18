import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getTaxReadinessSummary } from "@/lib/tax/return-prep";
import { checkPermission } from "@/lib/rbac";
import { taxAdvancedModuleDisabledResponse } from "@/lib/tax/module-gate";

type SessionWithWorkspace = {
  workspaceId?: string | null;
};

export async function GET() {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    const workspaceId = session?.workspaceId;
    const userId = (session as { user?: { id?: string | null } } | null)?.user?.id as string | undefined;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
    if (moduleDisabledResponse) return moduleDisabledResponse;

    const canView = await checkPermission(userId, workspaceId, "tax.readiness.view");
    const summary = await getTaxReadinessSummary(workspaceId, { includeSummary: canView });
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error("Tax readiness summary failed", error);
    return NextResponse.json({ error: "Failed to load tax readiness summary." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { runIndiaTaxReturnPrep } from "@/lib/tax/return-prep";
import { withPermission } from "@/lib/rbac";

type SessionWithWorkspace = {
  workspaceId?: string | null;
};

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    const workspaceId = session?.workspaceId;
    const userId = (session as { user?: { id?: string | null } } | null)?.user?.id as string | undefined;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const perm = await withPermission(userId, workspaceId, "tax.readiness.run");
    if (!perm.granted) return perm.response;

    const body = (await request.json()) as { taxPeriodId?: string };

    if (!body?.taxPeriodId) {
      return NextResponse.json({ error: "taxPeriodId is required." }, { status: 400 });
    }

    const result = await runIndiaTaxReturnPrep({
      workspaceId,
      taxPeriodId: body.taxPeriodId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Tax readiness run failed", error);
    return NextResponse.json({ error: "Failed to run tax readiness pipeline." }, { status: 500 });
  }
}

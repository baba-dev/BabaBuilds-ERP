import { NextResponse } from "next/server";
import { ModuleDisabledError, requireModule } from "@/lib/modules";

export async function requireCashFlowModule(workspaceId: string): Promise<NextResponse | null> {
  try {
    await requireModule(workspaceId, "CASH_FLOW");
    return null;
  } catch (error) {
    if (error instanceof ModuleDisabledError) {
      return NextResponse.json(
        { error: "Cash flow module is not enabled for this workspace.", code: "MODULE_DISABLED" },
        { status: 403 },
      );
    }
    throw error;
  }
}

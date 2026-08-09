import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeSystemError } from "@/lib/diagnostics/ai-analyzer";
import { handleAdminApiError, verifySuperAdmin } from "@/app/api/admin/authz";

const requestSchema = z.object({
  logId: z.string().min(1).max(128),
}).strict();

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", code: "INVALID_REQUEST" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await analyzeSystemError(parsed.data.logId);
    if (!result) {
      return NextResponse.json(
        { error: "Diagnostic log not found or analysis failed", code: "ANALYSIS_FAILED" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { success: true, logId: result.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleAdminApiError(error, "Diagnostic analysis failed");
  }
}

import { NextResponse } from "next/server";
import { logSystemError } from "@/lib/diagnostics/logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { errorName, errorMessage, errorStack, route, method, userId, workspaceId } = body;

    // Reconstruct an Error object
    const error = new Error(errorMessage);
    error.name = errorName || "API_Error";
    error.stack = errorStack;

    const logEntry = await logSystemError(error, { route, method, userId, workspaceId });

    return NextResponse.json({ success: true, logId: logEntry?.id });
  } catch (err) {
    console.error("Error in diagnostics log API:", err);
    return NextResponse.json({ success: false, error: "Failed to log error" }, { status: 500 });
  }
}

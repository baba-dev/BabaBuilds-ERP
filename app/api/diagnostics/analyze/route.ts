import { NextResponse } from "next/server";
import { analyzeSystemError } from "@/lib/diagnostics/ai-analyzer";

export async function POST(req: Request) {
  try {
    const { logId } = await req.json();

    if (!logId) {
      return NextResponse.json({ success: false, error: "logId is required" }, { status: 400 });
    }

    // Trigger analysis asynchronously, do not await it so the response is fast
    analyzeSystemError(logId).catch(err => {
      console.error("Async analysis failed for logId:", logId, err);
    });

    return NextResponse.json({ success: true, message: "Analysis started" });
  } catch (err) {
    console.error("Error in diagnostic analysis endpoint:", err);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}

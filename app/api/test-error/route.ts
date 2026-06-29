import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // We trigger an intentional backend error to test the global error boundary and AI Logger
  try {
    // Simulating a deep backend failure (e.g. Prisma Error or undefined variable)
    const faultyObject: any = null;
    
    // This will throw a TypeError: Cannot read properties of null (reading 'crash')
    const result = faultyObject.crash();

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    // To properly test the AI logging, we want the error to bubble up or be handled by our logger directly
    // Since API routes don't always hit global-error.tsx (which is for the app router UI),
    // we manually log it here as if a middleware or wrapper caught it.
    
    const baseUrl = req.url ? new URL(req.url).origin : "http://localhost:3000";
    
    // Fire to our internal logger
    fetch(`${baseUrl}/api/diagnostics/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack,
        route: "/api/test-error",
        method: "GET"
      }),
    }).catch(console.error);

    return NextResponse.json(
      { success: false, error: "Test error triggered and logged!" },
      { status: 500 }
    );
  }
}

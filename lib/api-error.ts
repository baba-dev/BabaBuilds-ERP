import { NextResponse } from "next/server";
import { logSystemError } from "./diagnostics/logger";

export type ApiErrorBody = {
  error: string;
  code: string;
  details?: unknown;
};

export const apiError = (status: number, error: string, code: string, details?: unknown) => {
  const body: ApiErrorBody = details === undefined ? { error, code } : { error, code, details };
  
  if (status >= 500) {
    // Automatically log server errors
    const synthError = new Error(error);
    synthError.name = code;
    
    // We don't await this so we don't block the response
    logSystemError(synthError, {
      route: "api",
      metadata: { status, details }
    }).catch(console.error);
  }
  
  return NextResponse.json(body, { status });
};


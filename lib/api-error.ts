import { NextResponse } from "next/server";

export type ApiErrorBody = {
  error: string;
  code: string;
  details?: unknown;
};

export const apiError = (status: number, error: string, code: string, details?: unknown) => {
  const body: ApiErrorBody = details === undefined ? { error, code } : { error, code, details };
  return NextResponse.json(body, { status });
};

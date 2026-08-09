import { prisma } from "@/lib/prisma";

interface ErrorContext {
  route?: string;
  method?: string;
  userId?: string;
  workspaceId?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
}

/** Scrub common secrets and PII before persisting diagnostics. */
export function scrubSensitiveData(text: string): string {
  if (!text) return "";

  let scrubbed = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  scrubbed = scrubbed.replace(/(?:\+\d{1,3}\s?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g, "[PHONE]");
  scrubbed = scrubbed.replace(/(bearer\s+)[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, "$1[TOKEN]");
  scrubbed = scrubbed.replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g, "[API_KEY]");

  return scrubbed.slice(0, 32_000);
}

/**
 * Persist an application-generated error. Public HTTP ingestion and automatic AI
 * analysis are intentionally disabled; a super-admin must request analysis.
 */
export async function logSystemError(error: Error & { digest?: string }, context?: ErrorContext) {
  try {
    if (
      error.digest === "NEXT_REDIRECT" ||
      error.message?.includes("NEXT_REDIRECT") ||
      error.message?.includes("NEXT_NOT_FOUND") ||
      error.digest?.includes("NEXT_NOT_FOUND")
    ) {
      return null;
    }

    const message = scrubSensitiveData(error.message);
    const stackTrace = error.stack ? scrubSensitiveData(error.stack) : null;
    const sourceMatch = stackTrace?.match(/at\s+.*\((.*):\d+:\d+\)/);

    return await prisma.systemErrorLog.create({
      data: {
        errorType: scrubSensitiveData(error.name || "UnknownError").slice(0, 256),
        message,
        stackTrace,
        sourceFile: sourceMatch?.[1]?.slice(0, 1_000) || null,
        route: context?.route?.slice(0, 1_000),
        method: context?.method?.slice(0, 32),
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        environment: context?.environment || process.env.NODE_ENV || "development",
        metadata: context?.metadata ? JSON.parse(JSON.stringify(context.metadata)) : null,
        status: "UNRESOLVED",
      },
    });
  } catch (err) {
    console.error("Failed to log system error:", err);
    return null;
  }
}

import { PrismaClient } from "@prisma/client";

// Ensure we don't recreate the Prisma client in dev mode
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

interface ErrorContext {
  route?: string;
  method?: string;
  userId?: string;
  workspaceId?: string;
  environment?: string;
  metadata?: Record<string, any>;
}

/**
 * Scrubs sensitive data (PII) from error messages and stack traces
 * before they are sent to external services (like LLMs).
 */
export function scrubSensitiveData(text: string): string {
  if (!text) return "";
  
  // Basic scrubbing: Replace emails, phone numbers, and potential tokens/keys
  let scrubbed = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  scrubbed = scrubbed.replace(/(?:\+\d{1,3}\s?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g, "[PHONE]");
  scrubbed = scrubbed.replace(/(bearer\s+)[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, "$1[TOKEN]");
  
  return scrubbed;
}

/**
 * Logs an error to the database and optionally triggers AI analysis.
 */
export async function logSystemError(error: Error & { digest?: string }, context?: ErrorContext) {
  try {
    // 1. Filter out Next.js control flow errors
    if (
      error.digest === "NEXT_REDIRECT" || 
      error.message?.includes("NEXT_REDIRECT") || 
      error.message?.includes("NEXT_NOT_FOUND") || 
      error.digest?.includes("NEXT_NOT_FOUND")
    ) {
      return null;
    }

    const errorType = error.name || "UnknownError";
    const message = scrubSensitiveData(error.message);
    const stackTrace = error.stack ? scrubSensitiveData(error.stack) : null;
    
    // Extract source file from stack trace (very basic heuristic)
    let sourceFile = null;
    if (stackTrace) {
      const match = stackTrace.match(/at\s+.*\((.*):\d+:\d+\)/);
      if (match && match[1]) {
        sourceFile = match[1];
      }
    }

    // Save to DB
    const logEntry = await prisma.systemErrorLog.create({
      data: {
        errorType,
        message,
        stackTrace,
        sourceFile,
        route: context?.route,
        method: context?.method,
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        environment: context?.environment || process.env.NODE_ENV || "development",
        metadata: context?.metadata ? JSON.parse(JSON.stringify(context.metadata)) : null,
        status: "UNRESOLVED"
      }
    });

    // Fire-and-forget: Trigger AI analysis in the background
    // We fetch this via internal API to avoid blocking the current execution thread.
    // In Next.js Server Components, we can't easily fire-and-forget promises that survive response,
    // but hitting our own API endpoint asynchronously is a safe bet.
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/diagnostics/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId: logEntry.id }),
    }).catch(e => console.error("Failed to trigger AI analysis:", e));

    return logEntry;
  } catch (err) {
    console.error("Failed to log system error:", err);
    return null;
  }
}

import { logSystemError } from "./logger";

type AnyFunction = (...args: never[]) => Promise<unknown>;

/**
 * Wraps a Next.js Server Action to automatically catch, log, and rethrow any unhandled exceptions.
 * Prevents silent failures in Server Actions and ensures they hit the AI Diagnostics pipeline.
 */
export function withErrorLogger<T extends AnyFunction>(
  actionName: string,
  action: T
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return (await action(...args)) as Awaited<ReturnType<T>>;
    } catch (error: unknown) {
      // Log the error before rethrowing
      await logSystemError(error instanceof Error ? error : new Error(String(error)), {
        route: `ServerAction: ${actionName}`,
        method: "POST",
        metadata: {
          arguments: args,
        }
      }).catch(console.error); // Catch logger errors so we still throw the original
      
      throw error;
    }
  }) as T;
}

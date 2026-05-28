import { redirect } from "next/navigation";

function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

/**
 * Redirect unauthenticated users to the configured NextAuth sign-in page (`/login`).
 */
export function redirectToLogin(callbackPath = "/dashboard"): never {
  const safe = isSafeInternalPath(callbackPath) ? callbackPath : "/dashboard";
  redirect(`/login?callbackUrl=${encodeURIComponent(safe)}`);
}

import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { AuthzError, verifySuperAdmin } from "@/app/api/admin/authz";

/**
 * Preserve the independent page gate even during cached App Router transitions.
 * Auth denials deliberately conceal diagnostics; unexpected data/session/DB
 * errors must surface as errors rather than being mislabeled HTTP 404.
 */
export async function requireSystemHealthSuperAdmin() {
  try {
    return await verifySuperAdmin();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.code === "UNAUTHORIZED") redirectToLogin("/admin/system-health");
      notFound();
    }
    throw error;
  }
}

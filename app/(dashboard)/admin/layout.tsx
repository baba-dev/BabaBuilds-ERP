import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/auth/login-redirect";
import { isSetupGap } from "@/lib/admin/access";
import { getAdminDecision } from "@/lib/admin/session";
import { AdminShell } from "./_components/AdminShell";
import { AdminSetupNotice } from "./_components/AdminSetupNotice";

export const metadata: Metadata = { title: "Platform admin" };
export const dynamic = "force-dynamic";

/**
 * One gate for every admin page, the same rule the /api/admin routes use (role ADMIN in the database AND email on the
 * SUPERADMIN_EMAILS allowlist). Strangers get a plain 404; a person who is half set up gets told exactly what is missing.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const decision = await getAdminDecision();
  if (!decision.ok) {
    if (decision.reason === "ANONYMOUS") redirectToLogin("/admin");
    if (isSetupGap(decision.reason)) return <AdminSetupNotice reason={decision.reason} email={decision.email ?? ""} />;
    notFound();
  }
  return <AdminShell email={decision.email} environment={process.env.NODE_ENV === "production" ? "production" : "development"}>{children}</AdminShell>;
}

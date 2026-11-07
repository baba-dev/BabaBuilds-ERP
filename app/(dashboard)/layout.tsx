import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { normalizeLaunchDestination } from "@/lib/launch-routing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;

  if (!session) {
    const nextUrl = requestHeaders.get("x-pathname-with-search") || requestHeaders.get("next-url");
    const callbackUrl = normalizeLaunchDestination(nextUrl || "/dashboard");
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  // Break potential redirect loops for authenticated users missing workspace context.
  // This can happen for legacy accounts or partial bootstrap failures. NextAuth's JWT callback
  // will attempt to auto-provision on the next request, but if it still fails we must not
  // bounce endlessly between /login and /dashboard.
  if (!workspaceId) {
    redirect("/login?error=WORKSPACE_CONTEXT_MISSING");
  }

  return (
    <DashboardShell>{children}</DashboardShell>
  );
}

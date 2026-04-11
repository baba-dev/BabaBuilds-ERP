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
  const workspaceId = (session as any)?.workspaceId;

  if (!session || !workspaceId) {
    if (!workspaceId) {
      console.warn(
        "[DashboardLayout] Missing workspace context on authenticated session; redirecting to recovery route."
      );
    }
    const nextUrl = requestHeaders.get('next-url');
    const callbackUrl = normalizeLaunchDestination(nextUrl || '/dashboard');
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <DashboardShell>{children}</DashboardShell>
  );
}

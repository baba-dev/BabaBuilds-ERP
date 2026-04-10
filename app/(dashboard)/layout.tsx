import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { normalizeLaunchDestination } from "@/lib/launch-routing";

const AIChatbot = dynamic(() => import("@/components/AIChatbot"), {
  ssr: false,
  loading: () => null,
});

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
    <>
      <DashboardShell>{children}</DashboardShell>
      <AIChatbot />
    </>
  );
}

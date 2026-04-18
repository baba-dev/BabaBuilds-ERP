import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AuthModal from "@/components/AuthModal";
import Link from "next/link";
import { Box } from "lucide-react";
import { normalizeLaunchDestination } from "@/lib/launch-routing";
import { LoginAmbientBackground } from "@/components/auth/LoginAmbientBackground";

type LoginPageProps = {
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
};

export const metadata: Metadata = {
  title: "Login to BabaBuilds ERP",
  description: "Secure sign-in page for accessing your BabaBuilds ERP workspace and business dashboard.",
  alternates: {
    canonical: "https://erp.bababuilds.com/login",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession(authOptions);
  const resolvedSearchParams = await searchParams;
  const callbackUrl = normalizeLaunchDestination(resolvedSearchParams?.callbackUrl ?? "/dashboard");
  const authError = resolvedSearchParams?.error;

  // If already authenticated, go to dashboard
  if (session) {
    // Avoid redirect loops when session exists but workspace context is missing.
    // In that case, send the user to setup to finalize provisioning (or let auth auto-provision on refresh).
    const workspaceId = (session as any)?.workspaceId;
    if (!workspaceId) {
      redirect("/setup");
    }
    redirect(callbackUrl);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      <LoginAmbientBackground particles />

      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="flex items-center gap-2 justify-center mb-8 group">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
            <Box className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black text-foreground px-2">BabaBuilds</span>
        </Link>

        <AuthModal callbackUrl={callbackUrl} authError={authError} />
      </div>
    </div>
  );
}

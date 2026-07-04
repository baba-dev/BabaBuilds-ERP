import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AuthModal from "@/components/AuthModal";
import Link from "next/link";
import { Box } from "lucide-react";
import { normalizeLaunchDestination } from "@/lib/launch-routing";
import { AuthAmbientBackground } from "@/components/auth/AuthAmbientBackground";
import { isDemoTemplateKey } from "@/lib/demo/templates";
import type { DemoTemplateKey } from "@/lib/demo/templates";
import { readSignupIntentPreview } from "@/lib/signup-intent-preview";
import { getGoogleAuthMissingEnvVars, isGoogleAuthEnabled } from "@/lib/auth/provider-flags";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
    openSandbox?: string;
    demoTemplate?: string;
  }>;
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
  const openSandboxOnLoad = resolvedSearchParams?.openSandbox === "1";
  const initialDemoTemplateKey: DemoTemplateKey | undefined = isDemoTemplateKey(
    resolvedSearchParams?.demoTemplate
  )
    ? resolvedSearchParams?.demoTemplate
    : undefined;

  const signupPreview = await readSignupIntentPreview();
  const googleAuthEnabled = isGoogleAuthEnabled();
  const missingGoogleAuthEnvVars =
    !googleAuthEnabled && process.env.NODE_ENV === "development"
      ? getGoogleAuthMissingEnvVars()
      : [];

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
    <div className="relative min-h-dvh flex flex-col items-center justify-center overflow-hidden bg-background">
      <AuthAmbientBackground />

      <div className="relative z-10 w-full max-w-md px-4 py-10 sm:py-14">
        <Link href="/" className="flex items-center gap-2 justify-center mb-8 group">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-600 text-white shadow-lg shadow-orange-500/25 ring-1 ring-orange-400/30 group-hover:scale-105 transition-transform duration-300">
            <Box className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black text-foreground px-2 tracking-tight">BabaBuilds</span>
        </Link>

        <AuthModal
          variant="embedded"
          callbackUrl={callbackUrl}
          authError={authError}
          openSandboxOnLoad={openSandboxOnLoad}
          initialDemoTemplateKey={initialDemoTemplateKey}
          signupPreview={signupPreview}
          googleAuthEnabled={googleAuthEnabled}
        />
        {missingGoogleAuthEnvVars.length > 0 && (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 shadow-sm backdrop-blur-sm dark:text-amber-200">
            Google sign-in is disabled in development because {missingGoogleAuthEnvVars.join(" and ")} {missingGoogleAuthEnvVars.length === 1 ? "is" : "are"} missing.
          </p>
        )}
      </div>
    </div>
  );
}
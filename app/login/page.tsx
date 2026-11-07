import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LoginExperience from "@/components/auth/LoginExperience";
import LoginShowcase from "@/components/auth/LoginShowcase";
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
    resetToken?: string;
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
  // Independent reads run together instead of in sequence.
  const [session, resolvedSearchParams, signupPreview] = await Promise.all([
    getServerSession(authOptions),
    searchParams,
    readSignupIntentPreview(),
  ]);

  const callbackUrl = normalizeLaunchDestination(resolvedSearchParams?.callbackUrl ?? "/dashboard");

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

  const initialDemoTemplateKey: DemoTemplateKey | undefined = isDemoTemplateKey(
    resolvedSearchParams?.demoTemplate
  )
    ? resolvedSearchParams?.demoTemplate
    : undefined;

  const googleAuthEnabled = isGoogleAuthEnabled();
  const missingGoogleAuthEnvVars =
    !googleAuthEnabled && process.env.NODE_ENV === "development"
      ? getGoogleAuthMissingEnvVars()
      : [];

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <LoginShowcase />

      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <AuthAmbientBackground />

        <div className="relative z-10 flex w-full flex-col items-center">
          <LoginExperience
            callbackUrl={callbackUrl}
            authError={resolvedSearchParams?.error}
            openSandboxOnLoad={resolvedSearchParams?.openSandbox === "1"}
            initialDemoTemplateKey={initialDemoTemplateKey}
            signupPreview={signupPreview}
            googleAuthEnabled={googleAuthEnabled}
            resetToken={resolvedSearchParams?.resetToken}
          />
          {missingGoogleAuthEnvVars.length > 0 && (
            <p className="mt-4 max-w-[26rem] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 shadow-sm backdrop-blur-sm dark:text-amber-200">
              Google sign-in is disabled in development because {missingGoogleAuthEnvVars.join(" and ")} {missingGoogleAuthEnvVars.length === 1 ? "is" : "are"} missing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

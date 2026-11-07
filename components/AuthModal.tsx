"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, getCsrfToken } from "next-auth/react";
import {
  Box,
  Sparkles,
  ArrowRight,
  Mail,
  LockKeyhole,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  KeyRound,
  Building2,
  Code2,
  Landmark,
  Hammer,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { startAuthentication } from "@simplewebauthn/browser";
import { Turnstile } from "@marsidev/react-turnstile";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DemoTemplateKey } from "@/lib/demo/templates/types";
import { isDemoTemplateKey } from "@/lib/demo/templates";
import type { SignupIntentPreview } from "@/lib/signup-intent-preview";
import { TURNSTILE_SITE_KEY } from "@/lib/auth/turnstile-config";

type AuthModalProps = {
  callbackUrl?: string;
  authError?: string;
  initialDemoTemplateKey?: DemoTemplateKey;
  openSandboxOnLoad?: boolean;
  signupPreview?: SignupIntentPreview | null;
  googleAuthEnabled?: boolean;
  /**
   * `modal`: full-screen overlay (e.g. unauthenticated dashboard prompt).
   * `embedded`: sits in-page on `/login` with the ambient background visible behind it.
   */
  variant?: "modal" | "embedded";
};

type EmailErrorCase = "CONFIG_ERROR" | "RATE_LIMITED" | "INVALID_EMAIL" | "GENERIC";
type EmailStatus = "idle" | "loading" | "success" | "error";
type AuthMethod = "passkey" | "google" | "password" | "magic_link" | "demo";

const LAST_AUTH_METHOD_KEY = "last_auth_method";

const HIGH_RISK_MAGIC_LINK_BLOCKED = "HIGH_RISK_MAGIC_LINK_BLOCKED";
const HIGH_RISK_PASSWORD_BLOCKED = "HIGH_RISK_PASSWORD_BLOCKED";
const MFA_POLICY_BLOCK = "MFA_POLICY_BLOCK";
const subtleInteractive =
  "transition-[background-color,border-color,box-shadow,transform,color] duration-200 ease-out";

function hasNextAuthErrorRedirect(payload: Record<string, unknown>): boolean {
  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return true;
  }

  if (typeof payload.url !== "string" || payload.url.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(payload.url, window.location.origin);
    return parsed.searchParams.has("error");
  } catch {
    return payload.url.includes("error=");
  }
}

function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";

  const existing = window.localStorage.getItem("auth_device_fp");
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem("auth_device_fp", generated);
  return generated;
}

export default function AuthModal({
  callbackUrl = "/dashboard",
  authError,
  initialDemoTemplateKey,
  openSandboxOnLoad = false,
  signupPreview = null,
  googleAuthEnabled = true,
  variant = "modal",
}: AuthModalProps) {
  const t = useTranslations("AuthModal");
  const { status } = useSession();
  const isProd = process.env.NODE_ENV === "production";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [passwordMode, setPasswordMode] = useState<"login" | "reset">("login");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailErrorCase, setEmailErrorCase] = useState<EmailErrorCase | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isPolicyChecking, setIsPolicyChecking] = useState(false);
  const [selectedDemoTemplateKey, setSelectedDemoTemplateKey] =
    useState<DemoTemplateKey>(
      isDemoTemplateKey(initialDemoTemplateKey) ? initialDemoTemplateKey : "dm_agency"
    );
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(openSandboxOnLoad);
  const [magicLinkPolicyMessage, setMagicLinkPolicyMessage] = useState<string | null>(
    authError === HIGH_RISK_MAGIC_LINK_BLOCKED
      ? t("alerts.highRiskMagicLinkBlocked")
      : authError === HIGH_RISK_PASSWORD_BLOCKED
        ? "Password-only sign-in is disabled for Owner, Admin, and Finance Manager accounts. Use a passkey or Google sign-in."
        : authError === MFA_POLICY_BLOCK
          ? t("alerts.phishingResistantRequired")
          : null
  );
  const [isMagicLinkAllowed, setIsMagicLinkAllowed] = useState(
    authError !== HIGH_RISK_MAGIC_LINK_BLOCKED
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [cooldownMessage, setCooldownMessage] = useState<string | null>(null);
  const [requiresTurnstile, setRequiresTurnstile] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const [supportsConditionalMediation, setSupportsConditionalMediation] = useState(false);
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod | null>(null);
  const [authStatusMessage, setAuthStatusMessage] = useState("");

  const emailInputRef = useRef<HTMLInputElement>(null);
  const statusPanelRef = useRef<HTMLDivElement>(null);
  const fingerprint = useMemo(() => getDeviceFingerprint(), []);

  const rememberAuthMethod = (method: AuthMethod) => {
    setLastAuthMethod(method);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_AUTH_METHOD_KEY, method);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedMethod = window.localStorage.getItem(LAST_AUTH_METHOD_KEY);
    if (["passkey", "google", "password", "magic_link", "demo"].includes(storedMethod || "")) {
      setLastAuthMethod(storedMethod as AuthMethod);
    }

    const publicKeyCredential = window.PublicKeyCredential;
    setIsPasskeySupported(typeof publicKeyCredential !== "undefined");

    if (typeof publicKeyCredential?.isConditionalMediationAvailable === "function") {
      void publicKeyCredential
        .isConditionalMediationAvailable()
        .then(setSupportsConditionalMediation)
        .catch(() => setSupportsConditionalMediation(false));
    }
  }, []);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetTokenFromUrl = params.get("resetToken");
    if (resetTokenFromUrl) {
      setResetToken(resetTokenFromUrl);
      setPasswordMode("reset");
    }
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (emailStatus === "error") {
      emailInputRef.current?.focus();
      statusPanelRef.current?.focus();
      return;
    }

    if (emailStatus === "success") {
      statusPanelRef.current?.focus();
    }
  }, [emailStatus]);

  if (status === "loading" || status === "authenticated") return null;

  const mapEmailError = (error?: string | null): EmailErrorCase => {
    const normalized = (error || "").toUpperCase();
    if (normalized.includes("CONFIG")) return "CONFIG_ERROR";
    if (normalized.includes("RATE")) return "RATE_LIMITED";
    if (normalized.includes("INVALID_EMAIL")) return "INVALID_EMAIL";
    return "GENERIC";
  };

  const verifyMagicLinkPolicy = async ({ blocking = false }: { blocking?: boolean } = {}) => {
    if (!email || !email.includes("@")) return true;

    if (blocking) {
      setIsPolicyChecking(true);
    }

    try {
      const response = await fetch("/api/auth/magic-link-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        allowed?: boolean;
        reason?: string;
      };

      if (!response.ok || payload.allowed === false) {
        const reason = payload.reason || t("alerts.highRiskMagicLinkBlocked");
        setIsMagicLinkAllowed(false);
        setMagicLinkPolicyMessage(reason);
        return false;
      }

      setIsMagicLinkAllowed(true);
      setMagicLinkPolicyMessage(null);
      return true;
    } catch {
      setIsMagicLinkAllowed(false);
      setMagicLinkPolicyMessage(t("alerts.policyCheckFailed"));
      return false;
    } finally {
      if (blocking) {
        setIsPolicyChecking(false);
      }
    }
  };

  const sendMagicLink = async () => {
    if (isLoading || isPolicyChecking) return;

    const isAllowed = await verifyMagicLinkPolicy({ blocking: true });
    if (!isAllowed) {
      setEmailStatus("error");
      setAuthStatusMessage("Secure link sign-in is unavailable for this email right now.");
      setEmailErrorCase("GENERIC");
      return;
    }

    setIsLoading(true);
    setEmailStatus("loading");
    setAuthStatusMessage("Sending a secure sign-in link to your email.");
    setEmailErrorCase(null);
    setCooldownMessage(null);

    try {
      const csrfToken = await getCsrfToken();
      if (!csrfToken) {
        throw new Error("Missing CSRF token.");
      }

      const body = new URLSearchParams({
        email,
        csrfToken,
        callbackUrl,
        json: "true",
      });

      if (turnstileToken) {
        body.set("turnstileToken", turnstileToken);
      }

      const response = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Fingerprint": fingerprint,
        },
        body,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.status === 429) {
        const retryAfter = Number(payload?.retryAfter ?? 60);
        const mins = Math.max(1, Math.ceil(retryAfter / 60));
        const message = `Too many attempts. Retry in about ${mins} min.`;

        setCooldownMessage(message);
        setRequiresTurnstile(Boolean(payload?.requiresTurnstile));
        setEmailStatus("error");
        setEmailErrorCase("RATE_LIMITED");
        toast.error(message);
        return;
      }

      if (!response.ok || hasNextAuthErrorRedirect(payload)) {
        const inferredError =
          typeof payload.error === "string" ? mapEmailError(payload.error) : "GENERIC";
        setEmailStatus("error");
        setEmailErrorCase(inferredError);
        toast.error(t("alerts.emailFailed"));
        return;
      }

      setEmailStatus("success");
      setAuthStatusMessage("Secure sign-in link sent. Check your email to continue.");
      rememberAuthMethod("magic_link");
      setResendCooldown(30);
    } catch (error) {
      console.error(error);
      setEmailStatus("error");
      setEmailErrorCase("GENERIC");
      toast.error(t("alerts.emailFailed"));
    } finally {
      setIsLoading(false);
    }
  };


  const handlePasskeySignIn = async () => {
    if (isPasskeyLoading) return;
    if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
      toast.error("Passkeys are not available in this browser. Try Safari, Chrome, Edge, or your mobile PWA.");
      return;
    }

    setIsPasskeyLoading(true);
    setAuthStatusMessage("Opening your device passkey prompt.");
    try {
      const optionsResponse = await fetch("/api/auth/passkeys/login/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || "Passkey sign-in is unavailable.");
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      });
      const payload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || !payload.loginToken) throw new Error(payload.error || "Passkey verification failed.");
      const result = await signIn("passkey-login", { token: payload.loginToken, callbackUrl, redirect: false });
      if (result?.error) throw new Error("Unable to create a session from this passkey.");
      rememberAuthMethod("passkey");
      setAuthStatusMessage("Passkey accepted. Redirecting securely.");
      if (result?.url) window.location.href = result.url;
    } catch (error) {
      setAuthStatusMessage("Passkey sign-in was cancelled or failed.");
      toast.error(error instanceof Error ? error.message : "Passkey sign-in was cancelled or failed.");
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const getAuthResultErrorCode = (result: Awaited<ReturnType<typeof signIn>>) => {
    if (typeof result?.error === "string" && result.error) return result.error;
    if (!result?.url) return null;

    try {
      return new URL(result.url, window.location.origin).searchParams.get("error");
    } catch {
      return result.url.includes("HIGH_RISK_PASSWORD_BLOCKED")
        ? HIGH_RISK_PASSWORD_BLOCKED
        : result.url.includes("MFA_POLICY_BLOCK")
          ? MFA_POLICY_BLOCK
          : null;
    }
  };

  const getBlockedHighRiskMessage = (code: string | null) => {
    if (code === HIGH_RISK_PASSWORD_BLOCKED) {
      return "Password-only sign-in is disabled for Owner, Admin, and Finance Manager accounts. Use a passkey or Google sign-in.";
    }

    if (code === MFA_POLICY_BLOCK) {
      return "This high-privilege account requires phishing-resistant sign-in. Use a passkey or Google sign-in.";
    }

    return null;
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isPasswordLoading) return;
    setIsPasswordLoading(true);
    setAuthStatusMessage("Checking your email and password.");
    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn("password-login", { email, password, callbackUrl, redirect: false });
    } catch {
      toast.error("Network problem. Check your connection and try again.");
      return;
    } finally {
      setIsPasswordLoading(false);
    }
    const errorCode = getAuthResultErrorCode(result);
    const highRiskMessage = getBlockedHighRiskMessage(errorCode);
    if (highRiskMessage) {
      setMagicLinkPolicyMessage(highRiskMessage);
      setAuthStatusMessage(highRiskMessage);
      toast.error(highRiskMessage);
      return;
    }
    if (errorCode) {
      setAuthStatusMessage("Password sign-in failed. Check your details or use a stronger method.");
      toast.error("Email or password is incorrect, or this account requires stronger MFA.");
      return;
    }
    rememberAuthMethod("password");
    setAuthStatusMessage("Password accepted. Redirecting securely.");
    if (result?.url) window.location.href = result.url;
  };

  const handleForgotPassword = async () => {
    if (!email || isPasswordLoading) {
      toast.error("Enter your email first.");
      return;
    }
    setIsPasswordLoading(true);
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      toast.success("If that account exists, a password reset email has been sent.");
    } catch {
      toast.error("Network problem. Check your connection and try again.");
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !newPassword || isPasswordLoading) return;
    setIsPasswordLoading(true);
    let response: Response;
    let payload: { error?: string } = {};
    try {
      response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      payload = (await response.json().catch(() => ({}))) as { error?: string };
    } catch {
      toast.error("Network problem. Check your connection and try again.");
      return;
    } finally {
      setIsPasswordLoading(false);
    }
    if (!response.ok) {
      toast.error(payload.error || "Unable to reset password.");
      return;
    }
    setPasswordMode("login");
    setPassword(newPassword);
    setNewPassword("");
    toast.success("Password updated. Sign in with your new password.");
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    await sendMagicLink();
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    await sendMagicLink();
  };

  const handleDemoSignIn = async () => {
    if (!turnstileToken && isProd) {
      toast.error(t("alerts.completeSecurityCheck"));
      return;
    }

    setIsDemoLoading(true);
    setAuthStatusMessage("Preparing your demo sandbox.");

    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-fingerprint": getDeviceFingerprint(),
        },
        body: JSON.stringify({ token: turnstileToken, templateKey: selectedDemoTemplateKey }),
      });

      const data = (await response.json().catch(() => ({}))) as { email?: string; password?: string; error?: string };

      if (data.email && data.password) {
        rememberAuthMethod("demo");
        await signIn("demo-login", {
          email: data.email,
          password: data.password,
          callbackUrl,
        });
      } else {
        throw new Error(data.error || t("alerts.demoCreationFailed"));
      }
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("alerts.demoSystemBusy");
      toast.error(message);
    } finally {
      setIsDemoLoading(false);
    }
  };

  const isEmbedded = variant === "embedded";

  const preferredAuthMethods: AuthMethod[] = [
    ...(isPasskeySupported ? (["passkey"] as const) : []),
    ...(googleAuthEnabled ? (["google"] as const) : []),
    "password",
    "magic_link",
  ];
  const orderedAuthMethods = lastAuthMethod
    ? [
        lastAuthMethod,
        ...preferredAuthMethods.filter((method) => method !== lastAuthMethod),
      ].filter((method, index, methods) =>
        preferredAuthMethods.includes(method) && methods.indexOf(method) === index
      )
    : preferredAuthMethods;
  const getAuthMethodOrder = (method: AuthMethod) => {
    const methodOrder = orderedAuthMethods.indexOf(method);
    return methodOrder === -1 ? preferredAuthMethods.length : methodOrder;
  };

  const demoTemplateOptions: Array<{
    key: DemoTemplateKey;
    icon: typeof Building2;
  }> = [
    { key: "dm_agency", icon: Building2 },
    { key: "software_company", icon: Code2 },
    { key: "tax_agency", icon: Landmark },
    { key: "contractor_builder", icon: Hammer },
    { key: "freelancer_consultant", icon: UserRound },
  ];

  return (
    <div
      className={cn(
        "flex justify-center animate-in fade-in duration-300",
        isEmbedded
          ? "relative z-10 w-full"
          : "fixed inset-0 z-[999] flex items-end sm:items-center bg-background/55 backdrop-blur-md p-0 sm:p-4"
      )}
    >
      <div
        className={cn(
          "w-full max-w-md text-card-foreground overflow-hidden animate-in duration-300 max-h-[90vh] sm:max-h-none overflow-y-auto",
          isEmbedded
            ? [
                "rounded-2xl sm:rounded-[1.35rem]",
                "border border-border/80 dark:border-white/12",
                "bg-card/78 dark:bg-card/72 backdrop-blur-xl backdrop-saturate-150",
                "shadow-[0_20px_60px_-15px_color-mix(in_oklab,var(--foreground)_14%,transparent),0_0_0_1px_color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                "sm:zoom-in-95",
              ]
            : [
                "rounded-t-3xl sm:rounded-[1.35rem]",
                "border border-border/90 dark:border-white/10",
                "bg-card/85 dark:bg-card/78 backdrop-blur-xl backdrop-saturate-150",
                "shadow-[0_28px_70px_-18px_color-mix(in_oklab,var(--foreground)_18%,transparent)]",
                "sm:zoom-in-95 slide-in-from-bottom",
              ]
        )}
      >
        <div
          className={cn(
            "p-6 sm:p-8 text-center space-y-4 border-b border-border/70 bg-muted/25 dark:bg-muted/15"
          )}
        >
          <div className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center bg-orange-600 text-white shadow-inner shadow-orange-400/25 ring-1 ring-orange-400/35">
            <Box className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>
          {signupPreview && (
            <div className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-start">
              <p className="text-sm font-bold text-orange-800 dark:text-orange-200">
                Starting your {signupPreview.trialDays}-day {signupPreview.planLabel} trial
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No credit card required. Sign in below to create your workspace — trial ends{" "}
                {signupPreview.trialEndsAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5 p-6 sm:p-8">
          {isPasskeySupported && (
            <section className="space-y-2" style={{ order: getAuthMethodOrder("passkey") }}>
              <Button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={isPasskeyLoading || isLoading || isDemoLoading || isPasswordLoading}
                variant="primary-action"
                size="lg"
                className={cn("min-h-12 w-full rounded-xl text-base font-black shadow-lg shadow-orange-500/20 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2", subtleInteractive)}
              >
                {isPasskeyLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                Continue with passkey
              </Button>
              <div className="space-y-1 text-center text-[11px] leading-relaxed text-muted-foreground sm:px-4">
                <p className="font-semibold text-foreground/80">Fastest on this device</p>
                <p>Uses Face ID, fingerprint, or Windows Hello. No password to type.</p>
                {supportsConditionalMediation && <p>Passkeys can be suggested automatically when your browser offers them.</p>}
              </div>
            </section>
          )}

          {googleAuthEnabled && (
            <section className="space-y-3" style={{ order: getAuthMethodOrder("google") }}>
              {getAuthMethodOrder("google") > 0 && (
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-border" />
                  <span className="flex-shrink-0 mx-4 text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    {t("or")}
                  </span>
                  <div className="flex-grow border-t border-border" />
                </div>
              )}

              <Button
                onClick={() => {
                  rememberAuthMethod("google");
                  setAuthStatusMessage("Redirecting to Google sign-in.");
                  void signIn("google", { callbackUrl });
                }}
                disabled={isLoading || isDemoLoading || isPasswordLoading}
                variant="outline"
                size="lg"
                className={cn("w-full rounded-xl font-bold", subtleInteractive)}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {t("actions.continueWithGoogle")}
              </Button>
            </section>
          )}

          <section className="space-y-3" style={{ order: getAuthMethodOrder("password") }}>
            {getAuthMethodOrder("password") > 0 && <div className="relative flex items-center py-1"><div className="flex-grow border-t border-border" /><span className="mx-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">or</span><div className="flex-grow border-t border-border" /></div>}
            <form onSubmit={passwordMode === "reset" ? handleResetPassword : handlePasswordSignIn} className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4">
            <p className="text-sm font-bold">Sign in with password</p>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              <Input type="email" required placeholder={t("placeholders.email")} value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-xl bg-background/90 pl-10 pr-4" />
            </div>
            {passwordMode === "reset" ? (
              <>
                <Input type="text" required placeholder="Reset token" value={resetToken} onChange={(e) => setResetToken(e.target.value)} className="h-11 rounded-xl bg-background/90" />
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input type="password" required minLength={12} placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-11 rounded-xl bg-background/90 pl-10" />
                </div>
              </>
            ) : (
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl bg-background/90 pl-10" />
              </div>
            )}
            <Button type="submit" variant="primary-action" size="lg" disabled={isPasswordLoading || isLoading || isDemoLoading} className="w-full rounded-xl font-bold">
              {isPasswordLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : passwordMode === "reset" ? "Reset password" : "Continue with password"}
            </Button>
            <button type="button" onClick={passwordMode === "reset" ? () => setPasswordMode("login") : handleForgotPassword} className="w-full text-center text-xs text-orange-700 hover:underline dark:text-orange-300">
              {passwordMode === "reset" ? "Back to password login" : "Forgot password?"}
            </button>
            <p className="text-[11px] text-muted-foreground">Password sign-in may still require passkey or MFA for high-risk roles.</p>
            </form>
          </section>

          <section className="space-y-3" style={{ order: getAuthMethodOrder("magic_link") }}>
            {getAuthMethodOrder("magic_link") > 0 && <div className="relative flex items-center py-1"><div className="flex-grow border-t border-border" /><span className="mx-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">or</span><div className="flex-grow border-t border-border" /></div>}

            <form onSubmit={handleEmailSignIn} className="space-y-3">
            {emailStatus === "success" && (
              <div className="bg-orange-500/10 border border-orange-500/25 rounded-xl p-4 text-center space-y-2 animate-in fade-in">
                <CheckCircle2 className="w-8 h-8 text-orange-600 dark:text-orange-400 mx-auto" />
                <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                  {t("emailSent.title")}
                </p>
                <p className="text-xs text-muted-foreground">{t("emailSent.description", { email })}</p>
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              <Input
                ref={emailInputRef}
                type="email"
                required
                placeholder={t("placeholders.email")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setMagicLinkPolicyMessage(null);
                  setIsMagicLinkAllowed(true);
                  setCooldownMessage(null);

                  if (emailStatus === "error") {
                    setEmailStatus("idle");
                    setEmailErrorCase(null);
                  }
                }}
                onBlur={() => {
                  void verifyMagicLinkPolicy();
                }}
                className="h-11 w-full rounded-xl bg-background/90 pl-10 pr-4 placeholder:text-muted-foreground/70 dark:bg-background/80"
              />
            </div>

            {magicLinkPolicyMessage && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                {magicLinkPolicyMessage}
              </p>
            )}

            {cooldownMessage && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{cooldownMessage}</p>
                  {requiresTurnstile && (
                    <p className="text-amber-300/90 mt-1">
                      Complete the security check, then retry.
                    </p>
                  )}
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary-action"
              size="lg"
              disabled={
                isLoading ||
                isDemoLoading ||
                !isMagicLinkAllowed ||
                isPolicyChecking
              }
              className={cn("w-full rounded-xl font-bold disabled:hover:bg-orange-600", subtleInteractive)}
            >
              {isLoading || isPolicyChecking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                t("actions.sendMagicLink")
              )}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Magic link and Google sign-in both create your secure workspace session.
            </p>

            {emailStatus !== "idle" && (
              <div
                ref={statusPanelRef}
                tabIndex={-1}
                role={emailStatus === "error" ? "alert" : "status"}
                aria-live={emailStatus === "error" ? "assertive" : "polite"}
                className={`rounded-xl border p-3 space-y-2 outline-none ${
                    emailStatus === "error"
                    ? "bg-red-500/10 border-red-500/30"
                    : emailStatus === "loading"
                      ? "bg-muted border-border"
                      : "bg-orange-500/10 border-orange-500/22"
                }`}
              >
                {emailStatus === "loading" && (
                  <p className="text-xs text-muted-foreground">{t("status.sending")}</p>
                )}

                {emailStatus === "success" && (
                  <>
                    <p className="text-xs text-orange-700 dark:text-orange-300">{t("status.sent")}</p>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={isLoading || resendCooldown > 0}
                        className="text-xs text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-100 disabled:text-muted-foreground disabled:cursor-not-allowed"
                      >
                        {t("actions.resendLink")}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        {resendCooldown > 0
                          ? t("status.resendCooldown", { seconds: resendCooldown })
                          : t("status.resendReady")}
                      </p>
                    </div>
                  </>
                )}

                {emailStatus === "error" && (
                  <>
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">
                      {cooldownMessage
                        ? cooldownMessage
                        : t(`errors.${emailErrorCase || "GENERIC"}`)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{t("status.support")}</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleResend}
                        className="text-xs text-red-700 hover:text-red-800 dark:text-red-200 dark:hover:text-white"
                      >
                        {t("actions.retry")}
                      </button>
                      <a
                        href="mailto:support@bababuilds.com"
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        {t("actions.contactSupport")}
                      </a>
                    </div>
                  </>
                )}
              </div>
            )}
            </form>
          </section>



          <div className="sr-only" role="status" aria-live="polite">{authStatusMessage}</div>

          <div style={{ order: preferredAuthMethods.length + 1 }}>
          <Dialog open={isSandboxModalOpen} onOpenChange={setIsSandboxModalOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                data-testid="demo-auth-section"
                variant="ghost"
                disabled={isLoading || isDemoLoading || isPasswordLoading}
                className="h-auto w-full justify-start rounded-xl border border-border/80 bg-muted/35 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-muted/55 hover:text-foreground"
              >
                {t("actions.demoSection")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[45rem] border border-border/80 bg-card/95 p-0 backdrop-blur-sm">
              <div className="border-b border-border/70 bg-muted/25 p-6">
                <DialogHeader className="space-y-2">
                  <DialogTitle className="flex items-center gap-2 text-xl font-black tracking-tight">
                    <Sparkles className="h-5 w-5 text-orange-500" />
                    {t("sandboxModal.title")}
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    {t("sandboxModal.description")}
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {demoTemplateOptions.map((template) => {
                    const Icon = template.icon;
                    const isSelected = selectedDemoTemplateKey === template.key;
                    return (
                      <button
                        key={template.key}
                        type="button"
                        disabled={isDemoLoading || isLoading}
                        onClick={() => setSelectedDemoTemplateKey(template.key)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-all",
                          "bg-background/85 hover:bg-muted/45",
                          "shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--background)_90%,transparent)]",
                          isSelected
                            ? "border-orange-500/70 bg-orange-500/10 ring-1 ring-orange-500/35"
                            : "border-border/80"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 rounded-lg border p-1.5",
                              isSelected
                                ? "border-orange-500/40 bg-orange-500/12 text-orange-600 dark:text-orange-300"
                                : "border-border bg-background text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-semibold leading-tight">
                              {t(`demoTemplates.${template.key}.title`)}
                            </div>
                            <div className="text-xs leading-relaxed text-muted-foreground">
                              {t(`demoTemplates.${template.key}.description`)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!isDemoLoading && isProd && (
                  <div className="flex justify-center rounded-lg border border-border/80 bg-muted/25 py-2">
                    <Turnstile
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={(token) => {
                        setTurnstileToken(token);
                        setRequiresTurnstile(false);
                      }}
                      options={{ theme: "auto" }}
                    />
                  </div>
                )}

                <Button
                  data-testid="demo-auth-button"
                  onClick={handleDemoSignIn}
                  variant="secondary-info"
                  size="lg"
                  disabled={isLoading || isDemoLoading || (!turnstileToken && isProd)}
                  className={cn("w-full justify-between rounded-xl py-3", subtleInteractive)}
                >
                  <div className="flex items-center gap-3">
                    {isDemoLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                    ) : (
                      <Sparkles className="h-5 w-5 text-orange-500" />
                    )}
                    <span>
                      {isDemoLoading
                        ? t("actions.provisioningSandbox")
                        : t("sandboxModal.cta")}
                    </span>
                  </div>
                  {!isDemoLoading && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>

          <div className="pt-1 text-center text-xs text-muted-foreground" style={{ order: preferredAuthMethods.length + 2 }}>
            <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <Link href="/help" className="hover:text-foreground transition-colors">Documentation</Link>
              <span aria-hidden="true">&bull;</span>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <span aria-hidden="true">&bull;</span>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

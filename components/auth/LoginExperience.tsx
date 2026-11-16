"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCsrfToken, signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowRight,
  Box,
  ChevronLeft,
  CircleCheck,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { extractErrorCodeFromUrl, resolveLoginErrorKey, type LoginErrorKey } from "@/lib/auth/login-errors";
import type { DemoTemplateKey } from "@/lib/demo/templates/types";
import type { SignupIntentPreview } from "@/lib/signup-intent-preview";

const TurnstileWidget = dynamic(() => import("@/components/auth/TurnstileWidget"), { ssr: false });
const DemoSandboxDialog = dynamic(() => import("@/components/auth/DemoSandboxDialog"), { ssr: false });

type Step = "identify" | "method" | "reset" | "redirecting";
type Method = "password" | "magic_link";
type Busy = null | "password" | "passkey" | "magic_link" | "google" | "forgot" | "reset";
type AuthMethod = "passkey" | "google" | "password" | "magic_link" | "demo";

type LoginExperienceProps = {
  callbackUrl: string;
  authError?: string;
  openSandboxOnLoad?: boolean;
  initialDemoTemplateKey?: DemoTemplateKey;
  signupPreview?: SignupIntentPreview | null;
  googleAuthEnabled: boolean;
  /** Password-reset token from the emailed link; stripped from the address bar on mount. */
  resetToken?: string;
};

const LAST_AUTH_METHOD_KEY = "last_auth_method";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isProd = process.env.NODE_ENV === "production";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — convenience only */
  }
}

function getDeviceFingerprint(): string {
  const existing = readStorage("auth_device_fp");
  if (existing) return existing;
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeStorage("auth_device_fp", generated);
  return generated;
}

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Info className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[15rem] text-balance py-2 leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function LoginExperience({
  callbackUrl,
  authError,
  openSandboxOnLoad = false,
  initialDemoTemplateKey,
  signupPreview = null,
  googleAuthEnabled,
  resetToken: resetTokenProp,
}: LoginExperienceProps) {
  const t = useTranslations("LoginPage");
  const router = useRouter();
  const { update: refreshSession } = useSession();

  const [step, setStep] = useState<Step>(resetTokenProp ? "reset" : "identify");
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState(resetTokenProp ?? "");
  const [busy, setBusy] = useState<Busy>(null);
  const [errorKey, setErrorKey] = useState<LoginErrorKey | null>(() => resolveLoginErrorKey(authError));
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [needsTurnstile, setNeedsTurnstile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  // null = not yet detected. We render the passkey option optimistically (SSR) and only hide it if
  // the browser turns out not to support it, so the card does not jump after hydration.
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [lastMethod, setLastMethod] = useState<AuthMethod | null>(null);
  const [demoOpen, setDemoOpen] = useState(openSandboxOnLoad);
  const [announcement, setAnnouncement] = useState("");

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const conditionalStarted = useRef(false);

  const anyBusy = busy !== null || step === "redirecting";
  const passkeyVisible = passkeySupported !== false;

  const rememberMethod = useCallback((value: AuthMethod) => {
    setLastMethod(value);
    writeStorage(LAST_AUTH_METHOD_KEY, value);
  }, []);

  const showError = useCallback((key: LoginErrorKey, detail?: string | null) => {
    setErrorKey(key);
    setErrorDetail(detail ?? null);
  }, []);

  const clearError = useCallback(() => {
    setErrorKey(null);
    setErrorDetail(null);
  }, []);

  /* ── Mount: remembered method, passkey capability, reset-token hygiene ─────────────── */
  useEffect(() => {
    const stored = readStorage(LAST_AUTH_METHOD_KEY) as AuthMethod | null;
    if (stored && ["passkey", "google", "password", "magic_link", "demo"].includes(stored)) {
      setLastMethod(stored);
      if (stored === "magic_link") setMethod("magic_link");
    }
    setPasskeySupported(typeof window.PublicKeyCredential !== "undefined");

    // The emailed reset token must not linger in the address bar / history.
    if (resetTokenProp && window.location.search.includes("resetToken")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("resetToken");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [resetTokenProp]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === "method" && method === "password") passwordRef.current?.focus();
    if (step === "reset") newPasswordRef.current?.focus();
  }, [step, method]);

  /* ── Finish: refresh the client session, then navigate without a full reload ────────── */
  const finishSignIn = useCallback(
    async (url?: string | null) => {
      setStep("redirecting");
      setAnnouncement(t("redirecting"));
      let target = callbackUrl;
      try {
        const parsed = new URL(url || callbackUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
          target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        /* keep callbackUrl */
      }
      try {
        router.prefetch(target);
        await refreshSession();
        router.replace(target);
      } catch {
        // Soft navigation failed (e.g. stale chunks after a deploy): fall back to a full page load.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full reload when client-side navigation fails
        window.location.href = target;
      }
    },
    [callbackUrl, refreshSession, router, t]
  );

  /* ── Passkeys ─────────────────────────────────────────────────────────────────────── */
  const verifyPasskeyAssertion = useCallback(
    async (assertion: unknown) => {
      const verifyResponse = await fetch("/api/auth/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      });
      const payload = (await verifyResponse.json().catch(() => ({}))) as { loginToken?: string; error?: string };
      if (!verifyResponse.ok || !payload.loginToken) throw new Error(payload.error || t("passkeyFailed"));
      const result = await signIn("passkey-login", { token: payload.loginToken, callbackUrl, redirect: false });
      if (result?.error) throw new Error(t("passkeySession"));
      rememberMethod("passkey");
      await finishSignIn(result?.url);
    },
    [callbackUrl, finishSignIn, rememberMethod, t]
  );

  const handlePasskey = async () => {
    if (anyBusy) return;
    if (typeof window.PublicKeyCredential === "undefined") {
      toast.error(t("passkeyUnsupported"));
      return;
    }
    clearError();
    setBusy("passkey");
    setAnnouncement(t("passkeyOpening"));
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const optionsResponse = await fetch("/api/auth/passkeys/login/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || t("passkeyFailed"));
      const assertion = await startAuthentication({ optionsJSON: options });
      await verifyPasskeyAssertion(assertion);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("passkeyFailed"));
      setAnnouncement(t("passkeyFailed"));
    } finally {
      setBusy(null);
    }
  };

  // Passkey autofill ("conditional UI"): the browser offers saved passkeys on the email field.
  // Deferred so it never competes with first paint.
  useEffect(() => {
    if (!passkeySupported || conditionalStarted.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const available = await window.PublicKeyCredential?.isConditionalMediationAvailable?.();
        if (!available) return;
        conditionalStarted.current = true;
        const [{ startAuthentication }, optionsResponse] = await Promise.all([
          import("@simplewebauthn/browser"),
          fetch("/api/auth/passkeys/login/options", { method: "POST" }),
        ]);
        if (!optionsResponse.ok) return;
        const assertion = await startAuthentication({
          optionsJSON: await optionsResponse.json(),
          useBrowserAutofill: true,
        });
        setBusy("passkey");
        await verifyPasskeyAssertion(assertion);
      } catch {
        /* dismissed, aborted by an explicit passkey click, or unsupported — stay on the form */
      } finally {
        setBusy((current) => (current === "passkey" ? null : current));
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [passkeySupported, verifyPasskeyAssertion]);

  /* ── Step 1: identify ─────────────────────────────────────────────────────────────── */
  const handleIdentify = (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setEmailError(t("emailInvalid"));
      emailRef.current?.focus();
      return;
    }
    setEmail(value);
    setEmailError(null);
    clearError();
    setStep("method");
  };

  /* ── Password ─────────────────────────────────────────────────────────────────────── */
  const handlePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password || anyBusy) return;
    clearError();
    setBusy("password");
    setAnnouncement(t("checking"));
    try {
      const result = await signIn("password-login", { email, password, callbackUrl, redirect: false });
      const code = (typeof result?.error === "string" && result.error) || extractErrorCodeFromUrl(result?.url, window.location.origin);
      if (code || !result?.ok) {
        const key = resolveLoginErrorKey(code);
        showError(key && key !== "generic" ? key : "credentials");
        setAnnouncement(t("passwordFailed"));
        setPassword("");
        passwordRef.current?.focus();
        return;
      }
      rememberMethod("password");
      await finishSignIn(result.url);
    } catch {
      showError("generic");
    } finally {
      setBusy(null);
    }
  };

  const handleForgot = async () => {
    if (anyBusy) return;
    setBusy("forgot");
    try {
      await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      toast.success(t("forgotSent"));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetToken || !newPassword || anyBusy) return;
    clearError();
    setBusy("reset");
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        showError("generic", payload.error || t("resetFailed"));
        return;
      }
      setResetToken("");
      setNewPassword("");
      setStep(email ? "method" : "identify");
      setMethod("password");
      toast.success(t("resetDone"));
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(null);
    }
  };

  /* ── Magic link ───────────────────────────────────────────────────────────────────── */
  const handleMagicLink = async () => {
    if (anyBusy || resendCooldown > 0) return;
    if (needsTurnstile && isProd && !turnstileToken) {
      toast.error(t("completeCheck"));
      return;
    }
    clearError();
    setBusy("magic_link");
    setAnnouncement(t("linkSending"));
    try {
      const csrfToken = await getCsrfToken();
      if (!csrfToken) throw new Error("Missing CSRF token");
      const body = new URLSearchParams({ email, csrfToken, callbackUrl, json: "true" });
      if (turnstileToken) body.set("turnstileToken", turnstileToken);

      const response = await fetch("/api/auth/signin/email", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Fingerprint": getDeviceFingerprint() },
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.status === 429) {
        const minutes = Math.max(1, Math.ceil(Number(payload.retryAfter ?? 60) / 60));
        setNeedsTurnstile(Boolean(payload.requiresTurnstile));
        showError("generic", t("rateLimited", { minutes }));
        return;
      }

      const code =
        (typeof payload.error === "string" && payload.error) ||
        extractErrorCodeFromUrl(typeof payload.url === "string" ? payload.url : null, window.location.origin);
      if (!response.ok || code) {
        const key = resolveLoginErrorKey(code);
        showError(key && key !== "generic" ? key : "linkFailed");
        return;
      }

      rememberMethod("magic_link");
      setLinkSent(true);
      setResendCooldown(30);
      setAnnouncement(t("linkSentTo", { email }));
    } catch {
      showError("linkFailed");
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = () => {
    if (anyBusy) return;
    rememberMethod("google");
    setBusy("google");
    setAnnouncement(t("redirectingGoogle"));
    void signIn("google", { callbackUrl });
  };

  const resetFlow = () => {
    setStep("identify");
    setPassword("");
    setLinkSent(false);
    clearError();
    window.setTimeout(() => emailRef.current?.focus(), 0);
  };

  const errorMessage = useMemo(() => {
    if (!errorKey) return null;
    if (errorDetail) return errorDetail;
    return t(`errors.${errorKey}`);
  }, [errorKey, errorDetail, t]);

  /* ── Render ───────────────────────────────────────────────────────────────────────── */
  const title =
    step === "reset"
      ? t("resetTitle")
      : step === "redirecting"
        ? t("signingIn")
        : signupPreview
          ? t("trialTitle", { days: signupPreview.trialDays, plan: signupPreview.planLabel })
          : t("welcomeTitle");
  const subtitle =
    step === "reset"
      ? t("resetSubtitle")
      : step === "redirecting"
        ? t("redirecting")
        : signupPreview
          ? t("trialSubtitle", {
              date: new Date(signupPreview.trialEndsAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
            })
          : t("welcomeSubtitle");

  const lastUsedBadge = (value: AuthMethod) =>
    lastMethod === value ? (
      <span className="ms-auto rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
        {t("lastUsed")}
      </span>
    ) : null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="w-full max-w-[26rem]">
        {/* Mobile brand (the desktop brand lives in the showcase column) */}
        <Link href="/" className="group mb-8 flex items-center justify-center gap-2.5 lg:hidden" aria-label="BabaBuilds ERP">
          <span className="flex size-10 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-500/25 ring-1 ring-orange-400/30">
            <Box className="size-6" aria-hidden />
          </span>
          <span className="text-2xl font-black tracking-tight">BabaBuilds</span>
        </Link>

        <div className="rounded-3xl border border-border/80 bg-card/85 p-6 shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--foreground)_22%,transparent)] backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            {signupPreview && step !== "reset" && step !== "redirecting" && (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-800 dark:text-orange-200">
                <Sparkles className="size-3.5" aria-hidden />
                {t("trialBadge")}
              </p>
            )}
            <h1 className="text-balance text-2xl font-black tracking-tight sm:text-[1.7rem]">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>

          {errorMessage && step !== "redirecting" && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{errorMessage}</p>
            </div>
          )}

          {step === "redirecting" && (
            <div className="flex flex-col items-center gap-4 py-10" role="status">
              <Loader2 className="size-9 animate-spin text-orange-600" aria-hidden />
              <p className="text-sm text-muted-foreground">{t("redirecting")}</p>
            </div>
          )}

          {/* ── Step 1 ── */}
          {step === "identify" && (
            <div className="space-y-5">
              <form onSubmit={handleIdentify} noValidate className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="block text-sm font-semibold">
                    {t("emailLabel")}
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="login-email"
                      ref={emailRef}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="username webauthn"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      placeholder={t("emailPlaceholder")}
                      aria-invalid={emailError ? true : undefined}
                      aria-describedby={emailError ? "login-email-error" : undefined}
                      className="h-12 rounded-xl bg-background/90 ps-10 pe-3 text-base"
                    />
                  </div>
                  {emailError && (
                    <p id="login-email-error" className="text-xs font-medium text-red-700 dark:text-red-300">
                      {emailError}
                    </p>
                  )}
                </div>
                <Button type="submit" variant="primary-action" size="lg" disabled={anyBusy} className="h-12 w-full rounded-xl text-base font-bold">
                  {t("continue")}
                  <ArrowRight className="size-5 rtl:rotate-180" aria-hidden />
                </Button>
              </form>

              {(passkeyVisible || googleAuthEnabled) && <Divider label={t("or")} />}

              <div className="space-y-3">
                {passkeyVisible && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      onClick={handlePasskey}
                      disabled={anyBusy}
                      variant="outline"
                      size="lg"
                      className="h-12 flex-1 justify-start gap-3 rounded-xl font-semibold"
                    >
                      {busy === "passkey" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <KeyRound className="size-5 text-orange-600" aria-hidden />}
                      {t("passkey")}
                      {lastUsedBadge("passkey")}
                    </Button>
                    <InfoTip label={t("passkeyTipLabel")}>{t("passkeyHint")}</InfoTip>
                  </div>
                )}
                {googleAuthEnabled && (
                  <Button
                    type="button"
                    onClick={handleGoogle}
                    disabled={anyBusy}
                    variant="outline"
                    size="lg"
                    className="h-12 w-full justify-start gap-3 rounded-xl font-semibold"
                  >
                    {busy === "google" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleMark />}
                    {t("google")}
                    {lastUsedBadge("google")}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === "method" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("signingInAs")}</p>
                  <p className="truncate text-sm font-semibold" dir="ltr">
                    {email}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={resetFlow} className="shrink-0 gap-1">
                  <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                  {t("changeEmail")}
                </Button>
              </div>

              {passkeyVisible && (
                <Button
                  type="button"
                  onClick={handlePasskey}
                  disabled={anyBusy}
                  variant="primary-action"
                  size="lg"
                  className="h-12 w-full rounded-xl text-base font-bold"
                >
                  {busy === "passkey" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <KeyRound className="size-5" aria-hidden />}
                  {t("passkey")}
                </Button>
              )}

              {passkeyVisible && <Divider label={t("orUse")} />}

              <div role="tablist" aria-label={t("methodLabel")} className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
                {(["password", "magic_link"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`login-tab-${value}`}
                    aria-selected={method === value}
                    aria-controls={`login-panel-${value}`}
                    tabIndex={method === value ? 0 : -1}
                    onClick={() => {
                      setMethod(value);
                      clearError();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        const next = value === "password" ? "magic_link" : "password";
                        setMethod(next);
                        document.getElementById(`login-tab-${next}`)?.focus();
                      }
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                      method === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {value === "password" ? <LockKeyhole className="size-4" aria-hidden /> : <Mail className="size-4" aria-hidden />}
                    {value === "password" ? t("tabPassword") : t("tabLink")}
                  </button>
                ))}
              </div>

              {method === "password" ? (
                <form id="login-panel-password" role="tabpanel" aria-labelledby="login-tab-password" onSubmit={handlePassword} className="space-y-3">
                  {/* Hidden username field lets password managers pair the credential */}
                  <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden className="sr-only" />
                  <div className="space-y-1.5">
                    <label htmlFor="login-password" className="block text-sm font-semibold">
                      {t("passwordLabel")}
                    </label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        id="login-password"
                        ref={passwordRef}
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t("passwordPlaceholder")}
                        className="h-12 rounded-xl bg-background/90 pe-11 ps-10 text-base"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                        aria-pressed={showPassword}
                        className="absolute end-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                      >
                        {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" variant="primary-action" size="lg" disabled={anyBusy || !password} className="h-12 w-full rounded-xl text-base font-bold">
                    {busy === "password" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : t("signIn")}
                    {lastUsedBadge("password")}
                  </Button>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleForgot}
                      disabled={anyBusy}
                      className="text-sm font-medium text-orange-700 underline-offset-4 hover:underline disabled:opacity-50 dark:text-orange-300"
                    >
                      {busy === "forgot" ? t("sending") : t("forgot")}
                    </button>
                    <InfoTip label={t("passwordTipLabel")}>{t("passwordHint")}</InfoTip>
                  </div>
                </form>
              ) : (
                <div id="login-panel-magic_link" role="tabpanel" aria-labelledby="login-tab-magic_link" className="space-y-3">
                  {linkSent ? (
                    <div className="space-y-3 rounded-xl border border-orange-500/25 bg-orange-500/10 p-4 text-center" role="status">
                      <CircleCheck className="mx-auto size-8 text-orange-600 dark:text-orange-400" aria-hidden />
                      <p className="text-sm font-bold">{t("linkSentTitle")}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{t("linkSentTo", { email })}</p>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("linkDescription")}</p>
                  )}

                  {needsTurnstile && isProd && (
                    <div className="rounded-lg border border-border/80 bg-muted/25 p-2">
                      <TurnstileWidget onToken={setTurnstileToken} />
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={handleMagicLink}
                    variant={linkSent ? "outline" : "primary-action"}
                    size="lg"
                    disabled={anyBusy || resendCooldown > 0 || (needsTurnstile && isProd && !turnstileToken)}
                    className="h-12 w-full rounded-xl text-base font-bold"
                  >
                    {busy === "magic_link" ? (
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    ) : resendCooldown > 0 ? (
                      t("resendIn", { seconds: resendCooldown })
                    ) : linkSent ? (
                      t("resend")
                    ) : (
                      t("sendLink")
                    )}
                  </Button>
                </div>
              )}

              {googleAuthEnabled && (
                <Button type="button" onClick={handleGoogle} disabled={anyBusy} variant="ghost" size="lg" className="h-11 w-full gap-3 rounded-xl font-semibold">
                  {busy === "google" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleMark />}
                  {t("google")}
                </Button>
              )}
            </div>
          )}

          {/* ── Reset ── */}
          {step === "reset" && (
            <form onSubmit={handleReset} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="login-new-password" className="block text-sm font-semibold">
                  {t("newPassword")}
                </label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="login-new-password"
                    ref={newPasswordRef}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-12 rounded-xl bg-background/90 pe-11 ps-10 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    aria-pressed={showPassword}
                    className="absolute end-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </button>
                </div>
              </div>
              <Button type="submit" variant="primary-action" size="lg" disabled={anyBusy || newPassword.length < 12} className="h-12 w-full rounded-xl text-base font-bold">
                {busy === "reset" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : t("resetSubmit")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setResetToken("");
                  setStep("identify");
                }}
                className="w-full text-center text-sm font-medium text-orange-700 underline-offset-4 hover:underline dark:text-orange-300"
              >
                {t("backToSignIn")}
              </button>
            </form>
          )}

          {step !== "redirecting" && step !== "reset" && (
            <button
              type="button"
              data-testid="demo-auth-section"
              onClick={() => setDemoOpen(true)}
              disabled={anyBusy}
              className="mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-start text-sm font-medium text-foreground/80 transition-colors hover:border-orange-500/50 hover:bg-orange-500/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50"
            >
              <Sparkles className="size-4 shrink-0 text-orange-500" aria-hidden />
              <span className="flex-1">{t("demoLink")}</span>
              <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
            </button>
          )}
        </div>

        <nav aria-label={t("footerLabel")} className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link href="/help" className="hover:text-foreground">
            {t("help")}
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            {t("terms")}
          </Link>
        </nav>

        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>
      </div>

      {demoOpen && (
        <DemoSandboxDialog
          open={demoOpen}
          onOpenChange={setDemoOpen}
          callbackUrl={callbackUrl}
          initialTemplateKey={initialDemoTemplateKey}
        />
      )}
    </TooltipProvider>
  );
}

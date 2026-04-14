"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, getCsrfToken } from "next-auth/react";
import {
  Box,
  Sparkles,
  ArrowRight,
  Mail,
  Loader2,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Turnstile } from "@marsidev/react-turnstile";
import { toast } from "sonner";

type AuthModalProps = {
  callbackUrl?: string;
  authError?: string;
};

type EmailErrorCase = "CONFIG_ERROR" | "RATE_LIMITED" | "INVALID_EMAIL" | "GENERIC";
type EmailStatus = "idle" | "loading" | "success" | "error";

const HIGH_RISK_MAGIC_LINK_BLOCKED = "HIGH_RISK_MAGIC_LINK_BLOCKED";
const MFA_POLICY_BLOCK = "MFA_POLICY_BLOCK";

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
}: AuthModalProps) {
  const t = useTranslations("AuthModal");
  const { status } = useSession();
  const isProd = process.env.NODE_ENV === "production";

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailErrorCase, setEmailErrorCase] = useState<EmailErrorCase | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isPolicyChecking, setIsPolicyChecking] = useState(false);
  const [magicLinkPolicyMessage, setMagicLinkPolicyMessage] = useState<string | null>(
    authError === HIGH_RISK_MAGIC_LINK_BLOCKED
      ? t("alerts.highRiskMagicLinkBlocked")
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

  const emailInputRef = useRef<HTMLInputElement>(null);
  const statusPanelRef = useRef<HTMLDivElement>(null);
  const fingerprint = useMemo(() => getDeviceFingerprint(), []);

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

  const verifyMagicLinkPolicy = async () => {
    if (!email || !email.includes("@")) return true;

    setIsPolicyChecking(true);

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
      setIsPolicyChecking(false);
    }
  };

  const sendMagicLink = async () => {
    const isAllowed = await verifyMagicLinkPolicy();
    if (!isAllowed) {
      setEmailStatus("error");
      setEmailErrorCase("GENERIC");
      return;
    }

    setIsLoading(true);
    setEmailStatus("loading");
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

    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });

      const data = await response.json();

      if (data.email && data.password) {
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

  return (
    <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center bg-background/65 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-card text-card-foreground border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in sm:zoom-in-95 slide-in-from-bottom duration-300 max-h-[90vh] sm:max-h-none overflow-y-auto">
        <div className="p-6 sm:p-8 text-center space-y-4 border-b border-border bg-background/40">
          <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-xl shadow-inner shadow-indigo-400/20 flex items-center justify-center">
            <Box className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          <form onSubmit={handleEmailSignIn} className="space-y-3">
            {emailStatus === "success" && (
              <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-xl p-4 text-center space-y-2 animate-in fade-in">
                <CheckCircle2 className="w-8 h-8 text-indigo-500 mx-auto" />
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
                  {t("emailSent.title")}
                </p>
                <p className="text-xs text-muted-foreground">{t("emailSent.description", { email })}</p>
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              <input
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
                onBlur={verifyMagicLinkPolicy}
                className="w-full bg-background border border-input text-foreground rounded-xl pl-10 pr-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all placeholder:text-muted-foreground/70"
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

            <button
              type="submit"
              disabled={
                isLoading ||
                isDemoLoading ||
                !isMagicLinkAllowed ||
                isPolicyChecking
              }
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95"
            >
              {isLoading || isPolicyChecking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                t("actions.sendMagicLink")
              )}
            </button>

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
                      : "bg-indigo-500/10 border-indigo-500/20"
                }`}
              >
                {emailStatus === "loading" && (
                  <p className="text-xs text-muted-foreground">{t("status.sending")}</p>
                )}

                {emailStatus === "success" && (
                  <>
                    <p className="text-xs text-indigo-600 dark:text-indigo-300">{t("status.sent")}</p>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={isLoading || resendCooldown > 0}
                        className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-200 dark:hover:text-white disabled:text-muted-foreground disabled:cursor-not-allowed"
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

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink-0 mx-4 text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {t("or")}
            </span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <button
            onClick={() => signIn("google", { callbackUrl })}
            disabled={isLoading || isDemoLoading}
            className="w-full flex items-center justify-center gap-3 bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background text-foreground px-4 py-2.5 rounded-xl font-bold transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none border border-input"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t("actions.continueWithGoogle")}
          </button>

          <details className="rounded-xl border border-border bg-muted/40 p-3 group">
            <summary className="cursor-pointer list-none text-sm text-muted-foreground group-open:text-foreground">
              {t("actions.demoSection")}
            </summary>

            <div className="mt-3 space-y-3">
              {!isDemoLoading && isProd && (
                <div className="flex justify-center py-2 scale-90">
                  <Turnstile
                    siteKey="0x4AAAAAACvSwAyJa3nVFu2n"
                    onSuccess={(token) => {
                      setTurnstileToken(token);
                      setRequiresTurnstile(false);
                    }}
                    options={{ theme: "dark" }}
                  />
                </div>
              )}

              <button
                onClick={handleDemoSignIn}
                disabled={
                  isLoading ||
                  isDemoLoading ||
                  (!turnstileToken && isProd)
                }
                className="w-full flex items-center justify-between group bg-background hover:bg-muted border border-input hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background text-muted-foreground hover:text-foreground px-4 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="flex items-center gap-3">
                  {isDemoLoading ? (
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                  )}
                  <span>
                    {isDemoLoading
                      ? t("actions.provisioningSandbox")
                      : t("actions.tryInteractiveDemo")}
                  </span>
                </div>
                {!isDemoLoading && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
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
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthModalProps = {
  callbackUrl?: string;
  authError?: string;
  /**
   * `modal`: full-screen overlay (e.g. unauthenticated dashboard prompt).
   * `embedded`: sits in-page on `/login` with the ambient background visible behind it.
   */
  variant?: "modal" | "embedded";
};

type EmailErrorCase = "CONFIG_ERROR" | "RATE_LIMITED" | "INVALID_EMAIL" | "GENERIC";
type EmailStatus = "idle" | "loading" | "success" | "error";

const HIGH_RISK_MAGIC_LINK_BLOCKED = "HIGH_RISK_MAGIC_LINK_BLOCKED";
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
  variant = "modal",
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
  const [selectedDemoTemplateKey, setSelectedDemoTemplateKey] = useState<
    "dm_agency" | "software_company" | "tax_agency"
  >("dm_agency");
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
        headers: {
          "Content-Type": "application/json",
          "x-demo-fingerprint": getDeviceFingerprint(),
        },
        body: JSON.stringify({ token: turnstileToken, templateKey: selectedDemoTemplateKey }),
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

  const isEmbedded = variant === "embedded";

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
        </div>

        <div className="p-6 sm:p-8 space-y-5">
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
                onBlur={verifyMagicLinkPolicy}
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

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink-0 mx-4 text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {t("or")}
            </span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <Button
            onClick={() => signIn("google", { callbackUrl })}
            disabled={isLoading || isDemoLoading}
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

          <details className="rounded-xl border border-border bg-muted/40 p-3 group">
            <summary
              data-testid="demo-auth-section"
              className="cursor-pointer list-none text-sm text-muted-foreground group-open:text-foreground"
            >
              {t("actions.demoSection")}
            </summary>

            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={isDemoLoading || isLoading}
                  onClick={() => setSelectedDemoTemplateKey("dm_agency")}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                    selectedDemoTemplateKey === "dm_agency"
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-border bg-background/80 hover:bg-muted/60",
                  )}
                >
                  <div className="text-sm font-semibold">{t("demoTemplates.dm_agency.title")}</div>
                  <div className="text-xs text-muted-foreground">{t("demoTemplates.dm_agency.description")}</div>
                </button>

                <button
                  type="button"
                  disabled={isDemoLoading || isLoading}
                  onClick={() => setSelectedDemoTemplateKey("software_company")}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                    selectedDemoTemplateKey === "software_company"
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-border bg-background/80 hover:bg-muted/60",
                  )}
                >
                  <div className="text-sm font-semibold">{t("demoTemplates.software_company.title")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("demoTemplates.software_company.description")}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isDemoLoading || isLoading}
                  onClick={() => setSelectedDemoTemplateKey("tax_agency")}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                    selectedDemoTemplateKey === "tax_agency"
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-border bg-background/80 hover:bg-muted/60",
                  )}
                >
                  <div className="text-sm font-semibold">{t("demoTemplates.tax_agency.title")}</div>
                  <div className="text-xs text-muted-foreground">{t("demoTemplates.tax_agency.description")}</div>
                </button>
              </div>

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

              <Button
                data-testid="demo-auth-button"
                onClick={handleDemoSignIn}
                variant="secondary-info"
                size="lg"
                disabled={
                  isLoading ||
                  isDemoLoading ||
                  (!turnstileToken && isProd)
                }
                className={cn(
                  "w-full justify-between rounded-xl py-3 text-muted-foreground hover:text-foreground",
                  subtleInteractive,
                )}
              >
                <div className="flex items-center gap-3">
                  {isDemoLoading ? (
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-orange-500" />
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
              </Button>
            </div>
          </details>

          <div className="pt-1 text-center text-xs text-muted-foreground">
            <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <Link href="/help" className="hover:text-foreground transition-colors">Documentation</Link>
              <span aria-hidden="true">&bull;</span>
              <Link href="/help/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <span aria-hidden="true">&bull;</span>
              <Link href="/help/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

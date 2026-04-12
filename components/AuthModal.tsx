"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Box, Sparkles, ArrowRight, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Turnstile } from "@marsidev/react-turnstile"; // Ensure this is installed
import { toast } from "sonner";

type AuthModalProps = {
  callbackUrl?: string;
};

type EmailErrorCase = "CONFIG_ERROR" | "RATE_LIMITED" | "INVALID_EMAIL" | "GENERIC";
type EmailStatus = "idle" | "loading" | "success" | "error";

export default function AuthModal({ callbackUrl = "/dashboard" }: AuthModalProps) {
  const t = useTranslations("AuthModal");
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailErrorCase, setEmailErrorCase] = useState<EmailErrorCase | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const statusPanelRef = useRef<HTMLDivElement>(null);
  
  // NEW: State to store the security token
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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

  const sendMagicLink = async () => {
    setIsLoading(true);
    setEmailStatus("loading");
    setEmailErrorCase(null);
    const res = await signIn("email", { email, redirect: false, callbackUrl });

    setIsLoading(false);
    if (res?.error) {
      setEmailStatus("error");
      setEmailErrorCase(mapEmailError(res.error));
      return;
    }

    setEmailStatus("success");
    setResendCooldown(30);
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
    if (!turnstileToken && process.env.NODE_ENV === "production") {
      toast.error(t("alerts.completeSecurityCheck"));
      return;
    }

    setIsDemoLoading(true);
    try {
      const response = await fetch("/api/auth/demo", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }) 
      });
      
      const data = await response.json();

      // --- 🚨 SECURITY PATCH START ---
      // Require both email AND the newly generated password
      if (data.email && data.password) {
        await signIn("demo-login", { 
          email: data.email, 
          password: data.password, // Inject the secure token here
          callbackUrl,
        });
      } else {
        throw new Error(data.error || t("alerts.demoCreationFailed"));
      }
      // --- 🚨 SECURITY PATCH END ---

    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("alerts.demoSystemBusy");
      toast.error(message);
    } finally {
      setIsDemoLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        <div className="p-8 text-center space-y-4 border-b border-zinc-800/50 bg-zinc-900/20">
          <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-xl shadow-inner shadow-indigo-400/20 flex items-center justify-center">
            <Box className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">{t("title")}</h2>
            <p className="text-sm text-zinc-400 mt-1">{t("subtitle")}</p>
          </div>
        </div>

        <div className="p-8 space-y-5">
          
          {/* Email Magic Link Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-3">
            {emailStatus === "success" && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-center space-y-2 animate-in fade-in">
                <CheckCircle2 className="w-8 h-8 text-indigo-400 mx-auto" />
                <p className="text-sm font-medium text-indigo-300">{t("emailSent.title")}</p>
                <p className="text-xs text-zinc-400">{t("emailSent.description", { email })}</p>
              </div>
            )}

              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-zinc-500" />
                <input 
                  ref={emailInputRef}
                  type="email" 
                  required
                  placeholder={t("placeholders.email")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailStatus === "error") {
                      setEmailStatus("idle");
                      setEmailErrorCase(null);
                    }
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl pl-10 pr-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all placeholder:text-zinc-600"
                />
              </div>
              <button 
                type="submit" 
                disabled={isLoading || isDemoLoading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("actions.sendMagicLink")}
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
                      ? "bg-zinc-900 border-zinc-700"
                      : "bg-indigo-500/10 border-indigo-500/20"
                  }`}
                >
                  {emailStatus === "loading" && (
                    <p className="text-xs text-zinc-300">{t("status.sending")}</p>
                  )}

                  {emailStatus === "success" && (
                    <>
                      <p className="text-xs text-indigo-300">{t("status.sent")}</p>
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={isLoading || resendCooldown > 0}
                          className="text-xs text-indigo-200 hover:text-white disabled:text-zinc-500 disabled:cursor-not-allowed"
                        >
                          {t("actions.resendLink")}
                        </button>
                        <p className="text-[11px] text-zinc-400">
                          {resendCooldown > 0
                            ? t("status.resendCooldown", { seconds: resendCooldown })
                            : t("status.resendReady")}
                        </p>
                      </div>
                    </>
                  )}

                  {emailStatus === "error" && (
                    <>
                      <p className="text-xs font-medium text-red-300">{t(`errors.${emailErrorCase || "GENERIC"}`)}</p>
                      <p className="text-[11px] text-zinc-400">{t("status.support")}</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleResend}
                          className="text-xs text-red-200 hover:text-white"
                        >
                          {t("actions.retry")}
                        </button>
                        <a href="mailto:support@bababuilds.com" className="text-xs text-zinc-300 hover:text-white underline">
                          {t("actions.contactSupport")}
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink-0 mx-4 text-xs font-medium text-zinc-600 uppercase tracking-widest">{t("or")}</span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          <button 
            onClick={() => signIn("google", { callbackUrl })}
            disabled={isLoading || isDemoLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 text-zinc-900 px-4 py-2.5 rounded-xl font-bold transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t("actions.continueWithGoogle")}
          </button>

          <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 group">
            <summary className="cursor-pointer list-none text-sm text-zinc-300 group-open:text-zinc-100">
              {t("actions.demoSection")}
            </summary>

            <div className="mt-3 space-y-3">
              {/* NEW: Turnstile Widget - Only shows when not loading */}
              {!isDemoLoading && (
                <div className="flex justify-center py-2 scale-90">
                  <Turnstile 
                    siteKey="0x4AAAAAACvSwAyJa3nVFu2n" 
                    onSuccess={(token) => setTurnstileToken(token)} 
                    options={{ theme: 'dark' }}
                  />
                </div>
              )}

              {/* Interactive Demo Button */}
              <button 
                onClick={handleDemoSignIn} 
                disabled={isLoading || isDemoLoading || (!turnstileToken && process.env.NODE_ENV === "production")}
                className="w-full flex items-center justify-between group bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 text-zinc-300 px-4 py-3 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="flex items-center gap-3">
                  {isDemoLoading ? (
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                  )}
                  <span>{isDemoLoading ? t("actions.provisioningSandbox") : t("actions.tryInteractiveDemo")}</span>
                </div>
                {!isDemoLoading && <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />}
              </button>
            </div>
          </details>

        </div>
      </div>
    </div>
  );
}

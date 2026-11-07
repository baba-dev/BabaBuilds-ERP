"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Building2, Code2, Hammer, Landmark, Loader2, Sparkles, UserRound } from "lucide-react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isDemoTemplateKey } from "@/lib/demo/templates";
import type { DemoTemplateKey } from "@/lib/demo/templates/types";

const TurnstileWidget = dynamic(() => import("@/components/auth/TurnstileWidget"), { ssr: false });

const TEMPLATES: Array<{ key: DemoTemplateKey; icon: typeof Building2 }> = [
  { key: "dm_agency", icon: Building2 },
  { key: "software_company", icon: Code2 },
  { key: "tax_agency", icon: Landmark },
  { key: "contractor_builder", icon: Hammer },
  { key: "freelancer_consultant", icon: UserRound },
];

function getDeviceFingerprint(): string {
  try {
    const existing = window.localStorage.getItem("auth_device_fp");
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem("auth_device_fp", generated);
    return generated;
  } catch {
    return "unknown";
  }
}

type DemoSandboxDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callbackUrl: string;
  initialTemplateKey?: DemoTemplateKey;
  onStarted?: () => void;
};

export default function DemoSandboxDialog({
  open,
  onOpenChange,
  callbackUrl,
  initialTemplateKey,
  onStarted,
}: DemoSandboxDialogProps) {
  const t = useTranslations("AuthModal");
  const isProd = process.env.NODE_ENV === "production";
  const [templateKey, setTemplateKey] = useState<DemoTemplateKey>(
    isDemoTemplateKey(initialTemplateKey) ? initialTemplateKey : "dm_agency"
  );
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (isProd && !turnstileToken) {
      toast.error(t("alerts.completeSecurityCheck"));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-fingerprint": getDeviceFingerprint() },
        body: JSON.stringify({ token: turnstileToken, templateKey }),
      });
      const data = (await response.json().catch(() => ({}))) as { email?: string; password?: string; error?: string };
      if (!data.email || !data.password) {
        throw new Error(data.error || t("alerts.demoCreationFailed"));
      }
      try {
        window.localStorage.setItem("last_auth_method", "demo");
      } catch {
        /* storage unavailable */
      }
      onStarted?.();
      await signIn("demo-login", { email: data.email, password: data.password, callbackUrl });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("alerts.demoSystemBusy"));
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="border border-border/80 bg-card/95 p-0 backdrop-blur-sm sm:max-w-[45rem]">
        <div className="border-b border-border/70 bg-muted/25 p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-black tracking-tight">
              <Sparkles className="h-5 w-5 text-orange-500" aria-hidden />
              {t("sandboxModal.title")}
            </DialogTitle>
            <DialogDescription className="text-sm">{t("sandboxModal.description")}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label={t("sandboxModal.title")}>
            {TEMPLATES.map(({ key, icon: Icon }) => {
              const selected = templateKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={loading}
                  onClick={() => setTemplateKey(key)}
                  className={cn(
                    "w-full rounded-xl border bg-background/85 p-3 text-start transition-all hover:bg-muted/45",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                    selected ? "border-orange-500/70 bg-orange-500/10 ring-1 ring-orange-500/35" : "border-border/80"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 rounded-lg border p-1.5",
                        selected
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300"
                          : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold leading-tight">{t(`demoTemplates.${key}.title`)}</div>
                      <div className="text-xs leading-relaxed text-muted-foreground">
                        {t(`demoTemplates.${key}.description`)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {isProd && !loading && (
            <div className="flex justify-center rounded-lg border border-border/80 bg-muted/25 py-2">
              <TurnstileWidget onToken={setTurnstileToken} />
            </div>
          )}

          <Button
            data-testid="demo-auth-button"
            onClick={start}
            variant="secondary-info"
            size="lg"
            disabled={loading || (isProd && !turnstileToken)}
            className="w-full justify-between rounded-xl py-3"
          >
            <span className="flex items-center gap-3">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" aria-hidden />
              ) : (
                <Sparkles className="h-5 w-5 text-orange-500" aria-hidden />
              )}
              {loading ? t("actions.provisioningSandbox") : t("sandboxModal.cta")}
            </span>
            {!loading && <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

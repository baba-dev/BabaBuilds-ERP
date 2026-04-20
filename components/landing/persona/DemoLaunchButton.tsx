"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DemoTemplateKey } from "@/lib/demo/templates";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

type DemoLaunchButtonProps = {
  templateKey: DemoTemplateKey;
  label?: string;
  className?: string;
  analyticsContext?: string;
  onLaunchStart?: () => void;
};

export function DemoLaunchButton({
  templateKey,
  label = "Try Live Demo",
  className,
  analyticsContext = "unknown",
  onLaunchStart,
}: DemoLaunchButtonProps) {
  const [loading, setLoading] = useState(false);

  const launchDemo = async () => {
    if (loading) return;
    setLoading(true);
    onLaunchStart?.();
    emitMarketingAnalyticsEvent("interactive_demo_click", {
      ctaLabel: label,
      role: templateKey,
      context: analyticsContext,
    });
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-fingerprint":
            typeof window !== "undefined" && window.localStorage.getItem("auth_device_fp")
              ? window.localStorage.getItem("auth_device_fp")!
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ templateKey }),
      });
      const data = (await response.json()) as {
        email?: string;
        password?: string;
        error?: string;
      };
      if (!response.ok || !data.email || !data.password) {
        throw new Error(data.error || "Unable to provision demo workspace right now.");
      }

      await signIn("demo-login", {
        email: data.email,
        password: data.password,
        callbackUrl: "/dashboard?demo=1",
      });
      emitMarketingAnalyticsEvent("interactive_demo_provisioned", {
        ctaLabel: label,
        role: templateKey,
        context: analyticsContext,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to launch demo right now.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={launchDemo}
      disabled={loading}
      variant="outline"
      size="lg"
      className={className}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {loading ? "Launching Demo..." : label}
    </Button>
  );
}

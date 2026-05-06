"use client";

import { useEffect, useState } from "react";
import { DownloadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/hooks/use-pwa";

const DISMISS_KEY = "baba-pwa-install-prompt-dismissed";

export function InstallAppPrompt() {
  const { isInstallable, installPWA } = usePWA();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!isInstallable || dismissed) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-orange-200/80 bg-white/90 p-3 shadow-lg shadow-orange-500/10 backdrop-blur dark:border-orange-900/50 dark:bg-zinc-950/80 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-orange-500/10 p-2 text-orange-600 dark:text-orange-300">
            <DownloadCloud className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">Install BabaBuilds ERP</p>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-muted-body">
              Add the app to your home screen for faster mobile access, offline-ready screens, and native-style launch.
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button type="button" className="flex-1 rounded-xl font-bold sm:flex-none" onClick={() => void installPWA()}>
            Install
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl"
            aria-label="Dismiss install prompt"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

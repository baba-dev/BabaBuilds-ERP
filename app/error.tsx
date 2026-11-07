"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { isStaleDeployError, recoverFromStaleDeploy } from "@/lib/errors/stale-deploy";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleDeploy = isStaleDeployError(error);
  const [recovering, setRecovering] = useState(staleDeploy);

  useEffect(() => {
    console.error("App route error boundary caught:", error);
    if (!staleDeploy) return;
    // A new version was deployed while this tab/service worker held the old one: refresh once.
    void recoverFromStaleDeploy().then((reloaded) => {
      if (!reloaded) setRecovering(false);
    });
  }, [error, staleDeploy]);

  const isAnalyzing = recovering;
  const friendlyMessage = staleDeploy
    ? "A new version of the app was released. Refresh to load it."
    : "We hit an unexpected error while loading this page. Try again, or refresh. If it keeps happening, share the error details below with support.";

  return (
    <div className="flex items-center justify-center min-h-[400px] w-full p-4">
      <div className="mx-auto w-full max-w-lg rounded-xl border bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
        
        {/* Header */}
        <div className="bg-red-50 dark:bg-red-950/30 px-6 py-4 border-b flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Oops! Something went wrong
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">
                Updating to the latest version...
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-4 border text-slate-700 dark:text-slate-300 text-sm leading-relaxed shadow-inner">
                {friendlyMessage}
              </div>

              <details className="rounded-lg border p-3 text-xs text-slate-600 dark:text-slate-400">
                <summary className="cursor-pointer font-medium">Error details</summary>
                <p className="mt-2 break-words font-mono">
                  {error.name}: {error.message}
                </p>
                {error.digest && <p className="mt-1 font-mono">Digest: {error.digest}</p>}
              </details>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void recoverFromStaleDeploy().then((reloaded) => {
                      if (!reloaded) window.location.reload();
                    });
                  }}
                  className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  Refresh Page
                </button>
                <button
                  type="button"
                  onClick={() => reset()}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-sm"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}

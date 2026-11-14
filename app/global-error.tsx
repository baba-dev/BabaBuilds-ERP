"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [friendlyMessage, setFriendlyMessage] = useState<string | null>(null);

  useEffect(() => {
    console.error("Global app error boundary caught:", error);
    
    const abortController = new AbortController();
    
    const timeoutId = setTimeout(() => {
      if (isAnalyzing) {
        setIsAnalyzing(false);
        setFriendlyMessage("A critical error occurred. Our team has been notified.");
      }
    }, 5000);

    fetch("/api/diagnostics/user-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        route: typeof window !== "undefined" ? window.location.pathname : "/_global_error",
      }),
      signal: abortController.signal
    })
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timeoutId);
        setFriendlyMessage(data.friendlyMessage);
        setIsAnalyzing(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          clearTimeout(timeoutId);
          setIsAnalyzing(false);
          setFriendlyMessage("A critical error occurred. Our team has been notified.");
        }
      });

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
  }, [error]);

  return (
    <html>
      <body className="bg-slate-50 dark:bg-slate-950">
        <main className="flex items-center justify-center min-h-dvh w-full p-4">
          <div className="mx-auto w-full max-w-lg rounded-xl border bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            
            <div className="bg-red-50 dark:bg-red-950/30 px-6 py-4 border-b flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Critical Application Error
                </h1>
              </div>
            </div>

            <div className="p-6">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">
                    Diagnosing the system failure...
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-4 border text-slate-700 dark:text-slate-300 text-sm leading-relaxed shadow-inner font-medium">
                    {friendlyMessage}
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    >
                      Refresh Page
                    </button>
                    <button
                      type="button"
                      onClick={() => reset()}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-sm"
                    >
                      Reload App
                    </button>
                  </div>
                </div>
              )}
            </div>
            
          </div>
        </main>
      </body>
    </html>
  );
}

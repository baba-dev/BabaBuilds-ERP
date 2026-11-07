"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [friendlyMessage, setFriendlyMessage] = useState<string | null>(null);

  useEffect(() => {
    console.error("App route error boundary caught:", error);
    
    const abortController = new AbortController();
    
    // Set a timeout to fallback to generic message if it takes > 5s
    const timeoutId = setTimeout(() => {
      if (isAnalyzing) {
        setIsAnalyzing(false);
        setFriendlyMessage("We hit an unexpected error while loading this page. Our team has been notified.");
      }
    }, 5000);

    fetch("/api/diagnostics/user-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        route: window.location.pathname,
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
          setFriendlyMessage("We hit an unexpected error while loading this page. Our team has been notified.");
        }
      });

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
  }, [error]);

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
                Our AI mechanic is analyzing what happened...
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-4 border text-slate-700 dark:text-slate-300 text-sm leading-relaxed shadow-inner">
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

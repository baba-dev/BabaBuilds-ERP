"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { openAIChat } from "@/src/stores/ui/aiChatStore";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { focusRing } from "./dashboard-ui";

const SUGGESTION_KEYS = ["owed", "overdue", "spend", "cash", "tax"] as const;

/** Hands a question to the workspace assistant, which opens with the answer. */
export function DashboardAskBar({ aiReady }: { aiReady: boolean }) {
  const t = useTranslations("DashboardHome");
  const [prompt, setPrompt] = useState("");

  const ask = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    openAIChat({ query: trimmed, autoSubmit: true });
    setPrompt("");
  };

  return (
    <section aria-label={t("ask.label")} className="rounded-2xl border border-border/70 bg-card p-2 shadow-xs sm:p-2.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(prompt);
        }}
        className="flex items-center gap-2"
      >
        <span className="ms-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <label htmlFor="dash-ask" className="sr-only">
          {t("ask.label")}
        </label>
        <input
          id="dash-ask"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t("ask.placeholder")}
          autoComplete="off"
          enterKeyHint="send"
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          aria-label={t("ask.send")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-25 pointer-coarse:h-10 pointer-coarse:w-10",
            focusRing,
          )}
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
      </form>
      {aiReady ? (
        <div className="scrollbar-none -mx-2 mt-1.5 flex gap-1.5 overflow-x-auto px-2 pb-0.5 sm:-mx-2.5 sm:px-2.5">
          {SUGGESTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => ask(t(`ask.suggestion.${key}`))}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground pointer-coarse:min-h-9",
                focusRing,
              )}
            >
              {t(`ask.suggestion.${key}`)}
            </button>
          ))}
        </div>
      ) : (
        // Without a key the assistant cannot answer; say so here rather than after the question is asked.
        <p className="mt-1.5 px-2 pb-1 text-xs text-muted-foreground">
          {t("ask.notConnected")}{" "}
          <Link href={DASHBOARD_ROUTES.settings} className={cn("rounded font-medium text-foreground underline underline-offset-2", focusRing)}>
            {t("ask.connect")}
          </Link>
        </p>
      )}
    </section>
  );
}

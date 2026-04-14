"use client";

import { useMemo, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  pagePath?: string;
};

type State = "idle" | "voted" | "submitting" | "submitted" | "error";

export function HelpFeedback({ slug, pagePath }: Props) {
  const [vote, setVote] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<State>("idle");

  const canSubmit = useMemo(() => vote !== null && state !== "submitting" && state !== "submitted", [vote, state]);

  const submit = async () => {
    if (!canSubmit || vote === null) return;
    setState("submitting");
    try {
      const res = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          helpful: vote,
          comment: comment.trim() ? comment.trim() : undefined,
          pagePath,
        }),
      });
      if (!res.ok) throw new Error("bad_status");
      setState("submitted");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-7">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">Was this helpful?</p>
          <p className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Your feedback improves the Help Center for everyone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={vote === true ? "default" : "outline"}
            className={cn(
              "rounded-2xl",
              vote === true && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
            )}
            onClick={() => {
              setVote(true);
              setState("voted");
            }}
            aria-pressed={vote === true}
          >
            <ThumbsUp className="w-4 h-4 mr-2" />
            Yes
          </Button>
          <Button
            type="button"
            variant={vote === false ? "default" : "outline"}
            className={cn(
              "rounded-2xl",
              vote === false && "bg-rose-600 hover:bg-rose-700 text-white border-rose-600",
            )}
            onClick={() => {
              setVote(false);
              setState("voted");
            }}
            aria-pressed={vote === false}
          >
            <ThumbsDown className="w-4 h-4 mr-2" />
            No
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional: tell us what was missing, confusing, or inaccurate…"
          className="min-h-24 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
        />
        <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            No personal data required. Keep feedback focused on the workflow.
          </p>
          <div className="flex items-center gap-3">
            {state === "submitted" ? (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Thanks — received.</span>
            ) : state === "error" ? (
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Could not submit.</span>
            ) : null}
            <Button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              Send feedback
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


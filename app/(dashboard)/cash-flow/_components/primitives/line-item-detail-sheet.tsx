"use client";

import * as React from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { SnapshotLineItem } from "../types";
import { labelForClassification, labelForDirection } from "./utils";

export function CashFlowLineItemDetailSheet({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SnapshotLineItem | null;
}) {
  const confidencePct = item?.confidence == null ? null : Math.round(item.confidence * 100);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="truncate">{item?.title ?? "Line item"}</span>
            {item?.classification ? (
              <Badge variant="outline" className="shrink-0">
                {labelForClassification(item.classification)}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {item ? (
              <span className="text-xs">
                {labelForDirection(item.direction)} · {new Date(item.expectedDate).toLocaleDateString()} ·{" "}
                {item.sourceType}
              </span>
            ) : (
              <span className="text-xs">Select a row to view details.</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {!item ? (
          <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/20 p-6 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-indigo-500" />
            <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pick a driver</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Row details explain why this line item exists and what to do next.
            </p>
          </div>
        ) : (
          <div className="space-y-5 px-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/40 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Amount
                </div>
                <div className="mt-2 text-lg font-black tabular-nums text-zinc-900 dark:text-zinc-50">
                  {Number(item.amount).toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/40 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Confidence
                </div>
                <div className={cn("mt-2 text-lg font-black tabular-nums", confidencePct != null && confidencePct < 60 ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-50")}>
                  {confidencePct == null ? "—" : `${confidencePct}%`}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/40 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Explanation
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
                {item.explanation ??
                  "This driver is included based on your current books and assumptions. If it looks off, tune assumptions or review source records."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {item.sourceId ? (
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <a href="#" onClick={(e) => e.preventDefault()}>
                    Open source record <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <a href="/cash-flow/assumptions">
                    Tune assumptions <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}


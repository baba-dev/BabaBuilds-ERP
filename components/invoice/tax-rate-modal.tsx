"use client";

import { useMemo } from "react";
import { Sparkles, Percent } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TaxRateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  taxLabel?: string;
  countryCode?: string;
  candidates?: number[];
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

export function TaxRateModal({
  open,
  onOpenChange,
  title = "Set your tax rate",
  description = "We couldn't infer a rate from your service codes. Enter your applicable rate once and we'll reuse it.",
  taxLabel = "Tax",
  countryCode,
  candidates = [],
  value,
  onValueChange,
  onConfirm,
  isSubmitting = false,
}: TaxRateModalProps) {
  const candidateButtons = useMemo(() => candidates.slice(0, 4), [candidates]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950/95 dark:backdrop-blur-xl">
        <div className="bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 border-b border-zinc-100 dark:border-zinc-800 px-6 py-5">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">{title}</DialogTitle>
                <DialogDescription className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                  {description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-xs uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-400">
            {taxLabel} rate {countryCode ? `for ${countryCode}` : ""}
          </div>
          <div className="relative">
            <Percent className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="e.g. 5 or 18"
              className="pl-9 h-12 text-base font-bold"
              inputMode="decimal"
            />
          </div>

          {candidateButtons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {candidateButtons.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => onValueChange((rate * 100).toString())}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  {(rate * 100).toFixed(2).replace(/\.00$/, '')}%
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!value || isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {isSubmitting ? "Saving..." : "Use this rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Percent, Sparkles, WandSparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TaxOverrideMode = "AUTO" | "AUTO_OVERRIDE" | "MANUAL";

export interface TaxOverrideWindow {
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface TaxOverrideDraft {
  mode: TaxOverrideMode;
  scope: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string;
  reason: string;
}

interface TaxOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAutoEstimate: number;
  onSave: (draft: TaxOverrideDraft) => void;
  existingOverrides?: TaxOverrideWindow[];
  isSubmitting?: boolean;
}

const isOverlap = (aStart: string, aEnd: string, bStart: string, bEnd?: string) => {
  const aStartTime = new Date(aStart).getTime();
  const aEndTime = new Date(aEnd || "9999-12-31").getTime();
  const bStartTime = new Date(bStart).getTime();
  const bEndTime = new Date(bEnd || "9999-12-31").getTime();

  return aStartTime <= bEndTime && bStartTime <= aEndTime;
};

export function TaxOverrideModal({
  open,
  onOpenChange,
  currentAutoEstimate,
  onSave,
  existingOverrides = [],
  isSubmitting = false,
}: TaxOverrideModalProps) {
  const [mode, setMode] = useState<TaxOverrideMode>("AUTO");
  const [scope, setScope] = useState("Current fiscal year");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [reason, setReason] = useState("");

  const resetForm = () => {
    setMode("AUTO");
    setScope("Current fiscal year");
    setRate("");
    setEffectiveFrom("");
    setEffectiveTo("");
    setReason("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const parsedRate = Number(rate);

  const rateError = useMemo(() => {
    if (!rate.trim()) return "";
    if (!Number.isFinite(parsedRate)) return "Enter a valid numeric rate";
    if (parsedRate < 0 || parsedRate > 100) return "Rate must be between 0 and 100";
    return "";
  }, [parsedRate, rate]);

  const dateError = useMemo(() => {
    if (!effectiveFrom || !effectiveTo) return "";
    if (effectiveTo < effectiveFrom) return "Effective to date must be after effective from date";

    const overlap = existingOverrides.some((window) =>
      isOverlap(effectiveFrom, effectiveTo, window.effectiveFrom, window.effectiveTo),
    );

    return overlap ? "Effective range overlaps with an existing override" : "";
  }, [effectiveFrom, effectiveTo, existingOverrides]);

  const newEstimate = useMemo(() => {
    if (!Number.isFinite(parsedRate) || parsedRate < 0) return currentAutoEstimate;
    return Math.max(0, currentAutoEstimate * (parsedRate / 100));
  }, [currentAutoEstimate, parsedRate]);

  const canSave =
    !!mode &&
    !!scope &&
    !!rate &&
    !!effectiveFrom &&
    !!effectiveTo &&
    !!reason.trim() &&
    !rateError &&
    !dateError &&
    !isSubmitting;

  const handleSave = () => {
    if (!canSave) return;

    onSave({
      mode,
      scope,
      rate,
      effectiveFrom,
      effectiveTo,
      reason,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl border-none shadow-2xl p-0 overflow-hidden bg-white/95 dark:bg-zinc-950/95 supports-backdrop-filter:backdrop-blur-xl"
      >
        <div className="bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 border-b border-zinc-100 dark:border-zinc-800 px-6 py-5">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                  Override tax rate
                </DialogTitle>
                <DialogDescription className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                  Add a temporary override while preserving auto-estimation for future periods.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as TaxOverrideMode)}>
                <SelectTrigger className="h-11 text-xs font-bold">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO" className="text-xs font-bold">Auto</SelectItem>
                  <SelectItem value="AUTO_OVERRIDE" className="text-xs font-bold">Auto+Override</SelectItem>
                  <SelectItem value="MANUAL" className="text-xs font-bold">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Scope</Label>
              <Input
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Current fiscal year"
                className="h-11 text-xs font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Rate %</Label>
              <div className="relative">
                <Percent className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 18"
                  className="h-11 pl-9 text-xs font-bold"
                />
              </div>
              {rateError && <p className="text-[11px] font-bold text-rose-500">{rateError}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Regulatory adjustment"
                className="h-11 text-xs font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Effective from</Label>
              <div className="relative">
                <CalendarClock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="h-11 pl-9 text-xs font-bold dark:[color-scheme:dark]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Effective to</Label>
              <div className="relative">
                <CalendarClock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  className="h-11 pl-9 text-xs font-bold dark:[color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {dateError && <p className="text-[11px] font-bold text-rose-500">{dateError}</p>}

          <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
              <WandSparkles className="w-4 h-4" />
              <p className="text-xs font-bold uppercase tracking-widest">Preview</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Current auto estimate</p>
                <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1">{currentAutoEstimate.toFixed(2)}%</p>
              </div>
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-800/60 bg-white/80 dark:bg-zinc-900/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">New overridden estimate</p>
                <p className="text-lg font-black text-indigo-700 dark:text-indigo-200 mt-1">{newEstimate.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
            className="text-xs font-bold uppercase tracking-widest"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-widest"
          >
            {isSubmitting ? "Saving..." : "Save override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

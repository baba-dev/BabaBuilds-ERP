"use client";

import { useState, useCallback, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormat } from "@/hooks/use-format";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SplitLine = { invoiceNumber: string; amount: number };

type OpenInv = {
  invoiceNumber: string;
  clientName: string;
  outstanding: number;
};

type InvoiceSplitEditorProps = {
  bankAmount: number;
  initialLines: SplitLine[];
  onChange: (lines: SplitLine[]) => void;
  className?: string;
};

export function InvoiceSplitEditor({
  bankAmount,
  initialLines,
  onChange,
  className,
}: InvoiceSplitEditorProps) {
  const { fCurrency } = useFormat();
  const [lines, setLines] = useState<SplitLine[]>(
    initialLines.length > 0 ? initialLines : [],
  );
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenInv[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onChange(lines);
  }, [lines, onChange]);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reconcile/open-invoices?${new URLSearchParams({ q, limit: "20" })}`,
      );
      const j = await res.json();
      if (res.ok && Array.isArray(j.data)) setOptions(j.data);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void runSearch(search), 250);
    return () => clearTimeout(t);
  }, [search, runSearch]);

  const sum = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const remainder = Math.round((bankAmount - sum) * 100) / 100;
  const balanced = Math.abs(remainder) < 0.02;

  const addInvoice = (inv: OpenInv) => {
    if (lines.some((l) => l.invoiceNumber === inv.invoiceNumber)) return;
    const amt = Math.min(inv.outstanding || bankAmount, Math.max(0, remainder || inv.outstanding));
    setLines((prev) => [...prev, { invoiceNumber: inv.invoiceNumber, amount: amt }]);
    setOpen(false);
    setSearch("");
  };

  const updateAmount = (invNum: string, val: string) => {
    const n = parseFloat(val.replace(/,/g, ""));
    setLines((prev) =>
      prev.map((l) =>
        l.invoiceNumber === invNum ? { ...l, amount: Number.isFinite(n) ? n : 0 } : l,
      ),
    );
  };

  return (
    <div className={cn("rounded-lg border border-amber-200/90 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
          Split across invoices
        </Label>
        <span
          className={cn(
            "text-xs font-medium",
            balanced
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-800 dark:text-amber-300",
          )}
        >
          {balanced ? "Balanced" : `Remaining: ${fCurrency(Math.max(0, remainder))}`}
        </span>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-2 w-full justify-between border-amber-300 bg-white text-amber-950 hover:bg-amber-50 dark:border-amber-800 dark:bg-zinc-950 dark:text-amber-100 dark:hover:bg-amber-950/40"
          >
            Add invoice line
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,380px)] p-0 dark:border-amber-900 dark:bg-zinc-900" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search invoice # or client…"
              value={search}
              onValueChange={setSearch}
              className="dark:text-zinc-100"
            />
            <CommandList>
              <CommandEmpty>{loading ? "Searching…" : "No matches."}</CommandEmpty>
              <CommandGroup>
                {options.map((inv) => (
                  <CommandItem
                    key={inv.invoiceNumber}
                    value={inv.invoiceNumber}
                    onSelect={() => addInvoice(inv)}
                    className="dark:text-zinc-200"
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    <div className="flex flex-col">
                      <span className="font-mono text-sm">{inv.invoiceNumber}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {inv.clientName} · due {fCurrency(inv.outstanding)}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.invoiceNumber} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">
              {line.invoiceNumber}
            </span>
            <Input
              type="number"
              step="0.01"
              className="h-8 w-28 border-amber-200 text-right dark:border-amber-900 dark:bg-zinc-950"
              value={line.amount || ""}
              onChange={(e) => updateAmount(line.invoiceNumber, e.target.value)}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-zinc-500 hover:text-rose-600"
              onClick={() =>
                setLines((prev) => prev.filter((l) => l.invoiceNumber !== line.invoiceNumber))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {lines.length === 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Use splits when one deposit pays multiple invoices.
        </p>
      )}
    </div>
  );
}

"use client";

import { useId } from "react";
import { Coins } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Currencies offered in the picker (the workspace base currency is always added). */
const COMMON_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "OMR", "QAR", "SGD", "AUD", "CAD", "JPY"];

type Props = {
  baseCurrency: string;
  /** "" means "same as base". */
  value: string;
  exchangeRate: string;
  onChange: (next: { currency: string; exchangeRate: string }) => void;
  labels: { currency: string; rate: (args: { from: string; to: string }) => string; rateHint: (args: { from: string; to: string }) => string };
};

/**
 * Invoice currency + exchange rate. The rate is the number of base-currency units per one unit of the
 * invoice currency, stored on the invoice so reports stay stable if the market rate moves later.
 */
export function InvoiceCurrencyField({ baseCurrency, value, exchangeRate, onChange, labels }: Props) {
  const rateId = useId();
  const active = value || baseCurrency;
  const options = Array.from(new Set([baseCurrency, ...COMMON_CURRENCIES]));
  const foreign = active !== baseCurrency;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
        <Coins className="h-3.5 w-3.5" aria-hidden /> {labels.currency}
      </Label>
      <div className="flex gap-2">
        <Select value={active} onValueChange={(next) => onChange({ currency: next === baseCurrency ? "" : next, exchangeRate: next === baseCurrency ? "" : exchangeRate })}>
          <SelectTrigger className="h-11 w-full bg-white text-xs font-bold dark:border-zinc-700 dark:bg-zinc-950" aria-label={labels.currency}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((code) => (
              <SelectItem key={code} value={code} className="text-xs font-bold">
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {foreign && (
          <div className="w-full">
            <Input
              id={rateId}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              required
              value={exchangeRate}
              onChange={(e) => onChange({ currency: value, exchangeRate: e.target.value })}
              placeholder={labels.rate({ from: active, to: baseCurrency })}
              aria-label={labels.rate({ from: active, to: baseCurrency })}
              className="h-11 bg-white text-sm font-bold dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        )}
      </div>
      {foreign && <p className="text-xs text-zinc-500 dark:text-zinc-400">{labels.rateHint({ from: active, to: baseCurrency })}</p>}
    </div>
  );
}

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const segmentedControlContainerClass =
  "inline-flex w-full items-center gap-1 rounded-2xl border border-zinc-200 bg-zinc-100 p-1.5 dark:border-zinc-800 dark:bg-zinc-900";

export const segmentedControlItemClass =
  "h-auto min-h-9 rounded-xl border border-transparent px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors dark:text-zinc-300 " +
  "hover:bg-white/80 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 " +
  "focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:text-zinc-400 dark:disabled:text-zinc-500";

export const segmentedControlItemActiveClass =
  "border-zinc-200 bg-white text-indigo-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-indigo-300";

export type SegmentedControlOption<TValue extends string> = {
  value: TValue;
  label: React.ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<TValue extends string> = {
  value: TValue;
  onValueChange: (next: TValue) => void;
  options: SegmentedControlOption<TValue>[];
  className?: string;
  listClassName?: string;
  itemClassName?: string;
  activeItemClassName?: string;
  itemAriaLabel?: (option: SegmentedControlOption<TValue>) => string;
};

export function SegmentedControl<TValue extends string>({
  value,
  onValueChange,
  options,
  className,
  listClassName,
  itemClassName,
  activeItemClassName,
  itemAriaLabel,
}: SegmentedControlProps<TValue>) {
  return (
    <div className={cn("w-full", className)}>
      <div className={cn(segmentedControlContainerClass, "flex-wrap", listClassName)}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={active}
              aria-label={itemAriaLabel?.(option)}
              disabled={option.disabled}
              onClick={() => onValueChange(option.value)}
              className={cn(
                "grow basis-[8.5rem] justify-center",
                segmentedControlItemClass,
                active && segmentedControlItemActiveClass,
                itemClassName,
                active && activeItemClassName,
              )}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

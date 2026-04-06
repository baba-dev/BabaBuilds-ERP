"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
  label?: string;
};

export function DataTablePagination({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  disabled,
  label,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{label ?? `Page ${currentPage} of ${totalPages}`}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={disabled || currentPage <= 1}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Prev
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={disabled || currentPage >= totalPages}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

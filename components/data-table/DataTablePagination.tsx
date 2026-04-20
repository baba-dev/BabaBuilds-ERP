"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { dirFromLocale } from "@/src/lib/direction";

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
  const locale = useLocale();
  const isRtl = dirFromLocale(locale) === "rtl";

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{label ?? `Page ${currentPage} of ${totalPages}`}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={disabled || currentPage <= 1}>
          {isRtl ? <ChevronRight className="me-1 h-4 w-4" /> : <ChevronLeft className="me-1 h-4 w-4" />} Prev
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={disabled || currentPage >= totalPages}>
          Next {isRtl ? <ChevronLeft className="ms-1 h-4 w-4" /> : <ChevronRight className="ms-1 h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

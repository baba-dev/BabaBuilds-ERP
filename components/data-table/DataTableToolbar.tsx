"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import type { DataTableFacetedFilter, DataTableFilterChip } from "./types";

type Props = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  chips?: DataTableFilterChip[];
  facetedFilters?: DataTableFacetedFilter[];
  rightSlot?: React.ReactNode;
};

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  chips = [],
  facetedFilters = [],
  rightSlot,
}: Props) {
  return (
    <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <Badge
                key={chip.id}
                variant={chip.active ? "default" : "secondary"}
                role="button"
                tabIndex={0}
                onClick={chip.onToggle}
                className="cursor-pointer"
              >
                {chip.label}
              </Badge>
            ))}
          </div>
        )}
        {facetedFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {facetedFilters.map((filter) =>
              filter.options.map((option) => {
                const active = filter.selectedValues.includes(option.value);
                return (
                  <Badge
                    key={`${filter.id}-${option.value}`}
                    variant={active ? "default" : "secondary"}
                    role="button"
                    tabIndex={0}
                    onClick={() => filter.onToggle(option.value)}
                    className="cursor-pointer"
                  >
                    {filter.label}: {option.label}
                  </Badge>
                );
              }),
            )}
          </div>
        )}
      </div>
      {rightSlot}
    </div>
  );
}

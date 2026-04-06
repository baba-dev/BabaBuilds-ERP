"use client";

import { Button } from "@/components/ui/button";

type BulkAction = {
  id: string;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
};

export function BulkSelectionActions({
  selectedCount,
  actions,
  clearSelection,
}: {
  selectedCount: number;
  actions: BulkAction[];
  clearSelection: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="text-xs font-semibold">{selectedCount} selected</span>
      {actions.map((action) => (
        <Button key={action.id} size="sm" variant={action.variant ?? "outline"} onClick={action.onClick}>
          {action.label}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={clearSelection}>
        Clear
      </Button>
    </div>
  );
}

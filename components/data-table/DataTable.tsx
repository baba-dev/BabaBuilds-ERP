"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/states/PageEmptyState";
import { PageErrorState } from "@/components/states/PageErrorState";
import { PageLoadingState } from "@/components/states/PageLoadingState";
import { BulkSelectionActions } from "./BulkSelectionActions";
import type { DataTableColumnDef, SortDirection } from "./types";

type Props<T> = {
  columns: DataTableColumnDef<T>[];
  data: T[];
  rowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyDescription: string;
  selectable?: boolean;
  bulkActions?: { id: string; label: string; onClick: (rows: T[]) => void; variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" }[];
  initialSort?: { columnId: string; direction: SortDirection };
  visibleColumnIds?: string[];
  className?: string;
};

export function DataTable<T>({
  columns,
  data,
  rowId,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  selectable,
  bulkActions = [],
  initialSort,
  visibleColumnIds,
  className,
}: Props<T>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sort, setSort] = useState<{ columnId: string; direction: SortDirection } | null>(initialSort ?? null);

  const activeColumns = useMemo(() => {
    if (!visibleColumnIds || visibleColumnIds.length === 0) return columns;
    return columns.filter((column) => visibleColumnIds.includes(column.id));
  }, [columns, visibleColumnIds]);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column) return data;
    const acc = column.sortAccessor ?? column.accessor;
    if (!acc) return data;

    return [...data].sort((a, b) => {
      const aValue = acc(a);
      const bValue = acc(b);
      if (aValue === bValue) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sort.direction === "asc" ? aValue - bValue : bValue - aValue;
      }
      const cmp = String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base" });
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, columns, sort]);

  const selectedRows = sortedData.filter((row) => selectedIds.includes(rowId(row)));

  const toggleSort = (columnId: string) => {
    setSort((current) => {
      if (!current || current.columnId !== columnId) return { columnId, direction: "asc" };
      if (current.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  };

  const allVisibleSelected = sortedData.length > 0 && sortedData.every((row) => selectedIds.includes(rowId(row)));

  return (
    <div className={className}>
      {selectable && bulkActions.length > 0 && (
        <BulkSelectionActions
          selectedCount={selectedIds.length}
          clearSelection={() => setSelectedIds([])}
          actions={bulkActions.map((action) => ({
            ...action,
            onClick: () => action.onClick(selectedRows),
          }))}
        />
      )}

      {loading ? (
        <PageLoadingState title="Loading" description="Pulling latest rows…" className="min-h-[280px]" />
      ) : error ? (
        <PageErrorState title="Table unavailable" description={error} onRetry={onRetry} className="min-h-[280px]" />
      ) : sortedData.length === 0 ? (
        <PageEmptyState title={emptyTitle} description={emptyDescription} className="min-h-[220px]" />
      ) : (
        <Table>
          <TableHeader className="bg-zinc-50 dark:bg-zinc-900/80">
            <TableRow className="dark:border-zinc-800 hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => {
                      setSelectedIds(checked ? sortedData.map((row) => rowId(row)) : []);
                    }}
                  />
                </TableHead>
              )}
              {activeColumns.map((column) => (
                <TableHead key={column.id} className={column.headerClassName}>
                  {column.sortable ? (
                    <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => toggleSort(column.id)}>
                      {column.header}
                      {sort?.columnId === column.id ? (
                        sort.direction === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5" /> : <ArrowDown className="ml-1 h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />
                      )}
                    </Button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row) => {
              const id = rowId(row);
              return (
                <TableRow key={id} className="dark:border-zinc-800 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  {selectable && (
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedIds.includes(id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds((prev) =>
                            checked ? [...prev, id] : prev.filter((existing) => existing !== id),
                          );
                        }}
                      />
                    </TableCell>
                  )}
                  {activeColumns.map((column) => (
                    <TableCell key={`${id}-${column.id}`} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

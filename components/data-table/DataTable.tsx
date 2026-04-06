"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pin } from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  useReactTable,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageEmptyState } from "@/components/states/PageEmptyState";
import { PageErrorState } from "@/components/states/PageErrorState";
import { PageLoadingState } from "@/components/states/PageLoadingState";
import { BulkSelectionActions } from "./BulkSelectionActions";
import type { DataTableColumnDef, DataTableStateModel, SortDirection } from "./types";

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
  searchValue?: string;
  searchColumnIds?: string[];
  className?: string;
  state?: Partial<DataTableStateModel>;
  onStateChange?: {
    setSorting?: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
    setColumnFilters?: (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => void;
    setColumnVisibility?: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
    setPagination?: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void;
    setRowSelection?: (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => void;
    setColumnPinning?: (updater: ColumnPinningState | ((old: ColumnPinningState) => ColumnPinningState)) => void;
  };
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
  searchValue,
  searchColumnIds = [],
  className,
  state,
  onStateChange,
}: Props<T>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.columnId, desc: initialSort.direction === "desc" }] : [],
  );
  const [internalColumnFilters, setInternalColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalColumnVisibility, setInternalColumnVisibility] = useState<VisibilityState>({});
  const [internalPagination, setInternalPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});
  const [internalColumnPinning, setInternalColumnPinning] = useState<ColumnPinningState>({});

  const activeColumns = useMemo(() => {
    if (!visibleColumnIds || visibleColumnIds.length === 0) return columns;
    return columns.filter((column) => visibleColumnIds.includes(column.id));
  }, [columns, visibleColumnIds]);

  const derivedState = {
    sorting: state?.sorting ?? internalSorting,
    columnFilters: state?.columnFilters ?? internalColumnFilters,
    columnVisibility: state?.columnVisibility ?? internalColumnVisibility,
    pagination: state?.pagination ?? internalPagination,
    rowSelection: state?.rowSelection ?? internalRowSelection,
    columnPinning: state?.columnPinning ?? internalColumnPinning,
    globalFilter: searchValue ?? "",
  };

  const table = useReactTable({
    data,
    columns: activeColumns.map((column) => {
      const tableColumn: ColumnDef<T, unknown> = {
        id: column.id,
        accessorFn: column.accessor ?? (() => undefined),
        header: () => column.header,
        cell: (ctx) => column.cell(ctx.row.original),
        enableSorting: column.sortable,
        enableHiding: column.hideable !== false,
        meta: {
          className: column.className,
          headerClassName: column.headerClassName,
        },
        sortingFn: column.sortAccessor
          ? (rowA, rowB) => {
              const aValue = column.sortAccessor?.(rowA.original);
              const bValue = column.sortAccessor?.(rowB.original);
              if (aValue === bValue) return 0;
              if (aValue == null) return 1;
              if (bValue == null) return -1;
              if (typeof aValue === "number" && typeof bValue === "number") return aValue - bValue;
              return String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base" });
            }
          : undefined,
      };
      return tableColumn;
    }),
    state: derivedState,
    getRowId: (row) => rowId(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: (row) => {
      if (!searchValue) return true;
      const loweredSearch = searchValue.toLowerCase();
      const targets = searchColumnIds.length > 0 ? searchColumnIds : activeColumns.map((column) => column.id);
      return targets.some((columnId) => {
        const value = row.getValue(columnId);
        return String(value ?? "").toLowerCase().includes(loweredSearch);
      });
    },
    onSortingChange: onStateChange?.setSorting ?? setInternalSorting,
    onColumnFiltersChange: onStateChange?.setColumnFilters ?? setInternalColumnFilters,
    onColumnVisibilityChange: onStateChange?.setColumnVisibility ?? setInternalColumnVisibility,
    onPaginationChange: onStateChange?.setPagination ?? setInternalPagination,
    onRowSelectionChange: onStateChange?.setRowSelection ?? setInternalRowSelection,
    onColumnPinningChange: onStateChange?.setColumnPinning ?? setInternalColumnPinning,
    enableRowSelection: selectable,
    enableColumnPinning: true,
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const rowModel = table.getRowModel();

  return (
    <div className={className}>
      {selectable && bulkActions.length > 0 && (
        <BulkSelectionActions
          selectedCount={selectedRows.length}
          clearSelection={() => table.toggleAllRowsSelected(false)}
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
      ) : rowModel.rows.length === 0 ? (
        <PageEmptyState title={emptyTitle} description={emptyDescription} className="min-h-[220px]" />
      ) : (
        <Table>
          <TableHeader className="bg-zinc-50 dark:bg-zinc-900/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="dark:border-zinc-800 hover:bg-transparent">
                {selectable && headerGroup.depth === 0 && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={table.getIsAllPageRowsSelected()}
                      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
                    />
                  </TableHead>
                )}
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const isPinned = header.column.getIsPinned();
                  const columnMeta = header.column.columnDef.meta as { headerClassName?: string } | undefined;
                  return (
                    <TableHead key={header.id} className={String(columnMeta?.headerClassName ?? "")}>
                      <div className="flex items-center gap-1">
                        {canSort ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2 h-8 px-2"
                            onClick={() => header.column.toggleSorting(sorted === "asc")}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp className="ml-1 h-3.5 w-3.5" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="ml-1 h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />
                            )}
                          </Button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                        {header.column.getCanPin() && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 ${isPinned ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"}`}
                            onClick={() => header.column.pin(isPinned === "left" ? false : "left")}
                            aria-label="Pin column"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rowModel.rows.map((row) => (
              <TableRow key={row.id} className="dark:border-zinc-800 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                {selectable && (
                  <TableCell className="w-10">
                    <Checkbox checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))} />
                  </TableCell>
                )}
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={String(((cell.column.columnDef.meta as { className?: string } | undefined)?.className) ?? "")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

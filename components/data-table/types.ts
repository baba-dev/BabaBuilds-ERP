import type { ReactNode } from "react";
import type {
  ColumnFiltersState,
  ColumnPinningState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";

export type SortDirection = "asc" | "desc";

export type DataTableColumnDef<T> = {
  id: string;
  header: ReactNode;
  accessor?: (row: T) => unknown;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  hideable?: boolean;
  sortAccessor?: (row: T) => string | number;
};

export type DataTableFilterChip = {
  id: string;
  label: string;
  active: boolean;
  onToggle: () => void;
};

export type DataTableRowAction<T> = {
  label: string;
  onClick: (row: T) => void;
  variant?: "default" | "danger";
  icon?: ReactNode;
  disabled?: boolean;
};

export type DataTableFacetedFilterOption = {
  label: string;
  value: string;
};

export type DataTableFacetedFilter = {
  id: string;
  label: string;
  options: DataTableFacetedFilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
};

export type DataTableStateModel = {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  pagination: PaginationState;
  rowSelection: RowSelectionState;
  columnPinning: ColumnPinningState;
};

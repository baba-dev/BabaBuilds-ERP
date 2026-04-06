import type { ReactNode } from "react";

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

"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  ColumnFiltersState,
  ColumnPinningState,
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import type { DataTableStateModel } from "./types";

type Updater<T> = T | ((old: T) => T);

type Options = {
  searchKey?: string;
  sortKey?: string;
  filtersKey?: string;
  visibilityKey?: string;
  paginationKey?: string;
  selectionKey?: string;
  pinningKey?: string;
  defaultPageSize?: number;
};

function resolveUpdater<T>(oldValue: T, updaterOrValue: Updater<T>): T {
  if (typeof updaterOrValue === "function") {
    return (updaterOrValue as (value: T) => T)(oldValue);
  }
  return updaterOrValue;
}

function parseSorting(value: string): SortingState {
  if (!value) return [];
  return value
    .split(",")
    .map((pair) => {
      const [id, dir] = pair.split(":");
      if (!id) return null;
      return { id, desc: dir === "desc" };
    })
    .filter(Boolean) as SortingState;
}

function serializeSorting(value: SortingState): string {
  return value.map((entry) => `${entry.id}:${entry.desc ? "desc" : "asc"}`).join(",");
}

function parseJsonState<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function useDataTableState(prefix: string, options?: Options) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const keys = useMemo(() => {
    return {
      search: options?.searchKey ?? `${prefix}_q`,
      sort: options?.sortKey ?? `${prefix}_sort`,
      filters: options?.filtersKey ?? `${prefix}_filters`,
      visibility: options?.visibilityKey ?? `${prefix}_cols`,
      pagination: options?.paginationKey ?? `${prefix}_page`,
      selection: options?.selectionKey ?? `${prefix}_sel`,
      pinning: options?.pinningKey ?? `${prefix}_pin`,
    };
  }, [options, prefix]);

  const search = searchParams.get(keys.search) ?? "";
  const sorting = parseSorting(searchParams.get(keys.sort) ?? "");
  const columnFilters = parseJsonState<ColumnFiltersState>(searchParams.get(keys.filters), []);
  const columnVisibility = parseJsonState<VisibilityState>(searchParams.get(keys.visibility), {});
  const pagination = parseJsonState<PaginationState>(searchParams.get(keys.pagination), {
    pageIndex: 0,
    pageSize: options?.defaultPageSize ?? 10,
  });
  const rowSelection = parseJsonState<RowSelectionState>(searchParams.get(keys.selection), {});
  const columnPinning = parseJsonState<ColumnPinningState>(searchParams.get(keys.pinning), {
    left: [],
    right: [],
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const setStateParam = <T,>(key: string, current: T, updaterOrValue: Updater<T>, serializer: (value: T) => string) => {
    const nextValue = resolveUpdater(current, updaterOrValue);
    setParam(key, serializer(nextValue));
  };

  const state: DataTableStateModel = {
    sorting,
    columnFilters,
    columnVisibility,
    pagination,
    rowSelection,
    columnPinning,
  };

  const setSearch = (value: string) => setParam(keys.search, value);

  const setSorting: OnChangeFn<SortingState> = (updaterOrValue) => {
    setStateParam(keys.sort, sorting, updaterOrValue as Updater<SortingState>, serializeSorting);
  };

  const setColumnFilters: OnChangeFn<ColumnFiltersState> = (updaterOrValue) => {
    setStateParam(keys.filters, columnFilters, updaterOrValue as Updater<ColumnFiltersState>, (value) =>
      value.length ? JSON.stringify(value) : "",
    );
  };

  const setColumnVisibility: OnChangeFn<VisibilityState> = (updaterOrValue) => {
    setStateParam(keys.visibility, columnVisibility, updaterOrValue as Updater<VisibilityState>, (value) => {
      const hasOverrides = Object.values(value).some((visible) => visible === false);
      return hasOverrides ? JSON.stringify(value) : "";
    });
  };

  const setPagination: OnChangeFn<PaginationState> = (updaterOrValue) => {
    setStateParam(keys.pagination, pagination, updaterOrValue as Updater<PaginationState>, (value) =>
      JSON.stringify(value),
    );
  };

  const setRowSelection: OnChangeFn<RowSelectionState> = (updaterOrValue) => {
    setStateParam(keys.selection, rowSelection, updaterOrValue as Updater<RowSelectionState>, (value) =>
      Object.keys(value).length ? JSON.stringify(value) : "",
    );
  };

  const setColumnPinning: OnChangeFn<ColumnPinningState> = (updaterOrValue) => {
    setStateParam(keys.pinning, columnPinning, updaterOrValue as Updater<ColumnPinningState>, (value) => {
      const hasPins = (value.left?.length ?? 0) > 0 || (value.right?.length ?? 0) > 0;
      return hasPins ? JSON.stringify(value) : "";
    });
  };

  return {
    search,
    setSearch,
    sort: searchParams.get(keys.sort) ?? "",
    setSort: (value: string) => setParam(keys.sort, value),
    state,
    setSorting,
    setColumnFilters,
    setColumnVisibility,
    setPagination,
    setRowSelection,
    setColumnPinning,
  };
}

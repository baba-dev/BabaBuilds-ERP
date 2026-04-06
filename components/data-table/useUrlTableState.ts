"use client";

import { useDataTableState } from "./useDataTableState";

type Options = {
  searchKey?: string;
  sortKey?: string;
};

export function useUrlTableState(prefix: string, options?: Options) {
  return useDataTableState(prefix, options);
}

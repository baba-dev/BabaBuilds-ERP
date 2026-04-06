"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Options = {
  searchKey?: string;
  sortKey?: string;
};

export function useUrlTableState(prefix: string, options?: Options) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const searchKey = options?.searchKey ?? `${prefix}_q`;
  const sortKey = options?.sortKey ?? `${prefix}_sort`;

  const search = searchParams.get(searchKey) ?? "";
  const sort = searchParams.get(sortKey) ?? "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return {
    search,
    sort,
    setSearch: (value: string) => setParam(searchKey, value),
    setSort: (value: string) => setParam(sortKey, value),
  };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./shared";

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [value, ms]);
  return v;
}

type Page<T> = { items: T[]; nextCursor: string | null } & Record<string, unknown>;

/**
 * Cursor-paged list that reloads whenever the path, params or reload key change.
 * `loading` is derived (the data on screen is for an older request), so no state is set inside the effect body.
 */
export function usePaged<T>(path: string, params: Record<string, string | undefined>, reloadKey: number) {
  const base = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    return `${path}?${p}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(params)]);
  const key = `${base}|${reloadKey}`;
  const [state, setState] = useState<{ key: string | null; items: T[]; cursor: string | null; extra: Record<string, unknown>; error: string | null }>({ key: null, items: [], cursor: null, extra: {}, error: null });
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Page<T>>(base)
      .then((d) => { if (!cancelled) setState({ key, items: d.items, cursor: d.nextCursor, extra: d, error: null }); })
      .catch((e) => { if (!cancelled) setState((s) => ({ ...s, key, error: e instanceof Error ? e.message : "error" })); });
    return () => { cancelled = true; };
  }, [base, key]);

  const loadMore = useCallback(async () => {
    if (!state.cursor) return;
    setMoreBusy(true);
    try {
      const d = await api<Page<T>>(`${base}&cursor=${encodeURIComponent(state.cursor)}`);
      setState((s) => ({ ...s, items: [...s.items, ...d.items], cursor: d.nextCursor }));
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : "error" }));
    } finally {
      setMoreBusy(false);
    }
  }, [state.cursor, base]);

  return { items: state.items, extra: state.extra, error: state.error, loading: state.key !== key, hasMore: Boolean(state.cursor), loadMore, moreBusy };
}

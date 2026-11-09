"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ACCESS_LABEL, Chip, ErrorNote, day, useAdminJson } from "./admin-kit";
import { AccountDrawer } from "./AccountDrawer";

type Row = { id: string; name: string; createdAt: string; isDemo: boolean; country: string; status: string; tier: string; interval: string | null; endsAt: string | null; access: string; members: number; invoices: number; owner: string | null; ownerName: string | null };
type List = { total: number; page: number; pages: number; accounts: Row[] };

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" }, { key: "PAID", label: "Paid" }, { key: "TRIAL", label: "Trial" }, { key: "EXPIRED_PAID", label: "Paid, expired" },
  { key: "EXPIRED_TRIAL", label: "Trial ended" }, { key: "FREE", label: "Free" }, { key: "SUSPENDED", label: "Suspended" },
];

export function AccountsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const access = params.get("access") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const sort = params.get("sort") ?? "newest";
  const demo = params.get("demo") ?? "hide";
  const open = params.get("open");
  const [text, setText] = useState(q);

  const set = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  // Search waits for a pause in typing.
  useEffect(() => { const h = setTimeout(() => { if (text !== q) set({ q: text || null, page: null }); }, 300); return () => clearTimeout(h); }, [text, q, set]);

  const url = `/api/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), ...(access ? { access } : {}), demo, sort, page: String(page) }).toString()}`;
  const { data, error, loading, reload } = useAdminJson<List>(url);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, owner email or id" aria-label="Search workspaces" className="h-9 ps-9" /></div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground">Sort
            <select value={sort} onChange={(e) => set({ sort: e.target.value === "newest" ? null : e.target.value, page: null })} className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option><option value="ending">Ending soonest</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" checked={demo === "all"} onChange={(e) => set({ demo: e.target.checked ? "all" : null, page: null })} className="size-3.5" />Show demo</label>
        </div>
      </div>

      <div role="group" aria-label="Filter by access" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={access === f.key} onClick={() => set({ access: f.key || null, page: null })} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", access === f.key ? "border-indigo-500 bg-indigo-600 text-white" : "border-border/70 hover:border-indigo-300")}>{f.label}</button>
        ))}
      </div>

      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!data && !error ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div> : null}

      {data ? (
        <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-opacity", loading && "opacity-60")}>
          {data.accounts.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No workspace matches. {q || access ? "Try clearing the search or filter." : ""}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border/60 bg-muted/40 text-start text-xs text-muted-foreground"><tr>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">Workspace</th><th scope="col" className="px-3 py-2.5 text-start font-medium">Access</th><th scope="col" className="px-3 py-2.5 text-start font-medium">Plan</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">Members</th><th scope="col" className="px-3 py-2.5 text-end font-medium">Invoices</th><th scope="col" className="px-4 py-2.5 text-end font-medium">Created</th>
                </tr></thead>
                <tbody className="divide-y divide-border/60">
                  {data.accounts.map((a) => {
                    const acc = ACCESS_LABEL[a.access] ?? ACCESS_LABEL.FREE;
                    return (
                      <tr key={a.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => set({ open: a.id })}>
                        <td className="px-4 py-3">
                          <button type="button" onClick={(e) => { e.stopPropagation(); set({ open: a.id }); }} className="text-start font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{a.name}</button>
                          {a.isDemo ? <span className="ms-2"><Chip>demo</Chip></span> : null}
                          <p className="text-xs text-muted-foreground">{a.owner ?? "no owner"}</p>
                        </td>
                        <td className="px-3 py-3"><Chip tone={acc.tone}>{acc.label}</Chip></td>
                        <td className="px-3 py-3 text-xs"><p>{a.tier === "FREE" ? "Free" : `${a.tier}${a.interval ? ` · ${a.interval.toLowerCase().replace("team_", "")}` : ""}`}</p><p className="text-muted-foreground">{a.endsAt ? `ends ${day(a.endsAt)}` : "no end date"}</p></td>
                        <td className="px-3 py-3 text-end tabular-nums">{a.members}</td>
                        <td className="px-3 py-3 text-end tabular-nums">{a.invoices}</td>
                        <td className="px-4 py-3 text-end text-xs text-muted-foreground">{day(a.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{data.total} workspace{data.total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page" className="rounded p-1 hover:bg-muted disabled:opacity-40"><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></button>
              <span className="tabular-nums">Page {data.page} of {data.pages}</span>
              <button type="button" disabled={page >= data.pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page" className="rounded p-1 hover:bg-muted disabled:opacity-40"><ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></button>
            </div>
          </div>
        </div>
      ) : null}

      <AccountDrawer id={open} onClose={() => set({ open: null })} onChanged={reload} />
      <p className="text-xs text-muted-foreground">Looking for the audit trail of one workspace? Open it and choose “View activity”. <Link href="/admin/logs" className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">All activity</Link></p>
    </div>
  );
}

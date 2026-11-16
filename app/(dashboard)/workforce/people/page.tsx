"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/workforce/StatusBadge";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { cn } from "@/lib/utils";

type Named = { id: string; name: string };
type Employee = {
  id: string; firstName: string; lastName: string; email: string | null; avatarUrl: string | null; employeeCode: string | null; status: string;
  department: Named | null; designation: { id: string; title: string } | null; manager: { id: string; firstName: string; lastName: string } | null;
};
type Opt = { id: string; label: string };
const STATUS = ["ALL", "ACTIVE", "ON_LEAVE", "INACTIVE"] as const;
const TONE: Record<string, string> = { ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", ON_LEAVE: "bg-amber-500/15 text-amber-700 dark:text-amber-300", INACTIVE: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" };
const EMPTY = { firstName: "", lastName: "", email: "", phone: "", departmentId: "", designationId: "", managerId: "", joinDate: new Date().toISOString().slice(0, 10), location: "" };

export default function PeoplePage() {
  const t = useTranslations("WorkforceHub");
  const [rows, setRows] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("ALL");
  const [dept, setDept] = useState("");
  const [depts, setDepts] = useState<Opt[]>([]);
  const [desigs, setDesigs] = useState<Opt[]>([]);
  const [mgrs, setMgrs] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => { const h = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), limit: "20" });
    if (q) qs.set("search", q);
    if (status !== "ALL") qs.set("status", status);
    if (dept) qs.set("department", dept);
    const res = await fetch(`/api/workforce/employees?${qs}`);
    if (res.ok) { const j = (await res.json()) as { employees: Employee[]; total: number; totalPages: number }; setRows(j.employees); setTotal(j.total); setPages(Math.max(1, j.totalPages)); }
    setLoading(false);
  }, [page, q, status, dept]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      const [d, g, m] = await Promise.all([fetch("/api/workforce/settings/departments"), fetch("/api/workforce/settings/designations"), fetch("/api/workforce/employees?status=ACTIVE&limit=100")]);
      if (m.ok) setMgrs(((await m.json()) as { employees: Employee[] }).employees.map((x) => ({ id: x.id, label: `${x.firstName} ${x.lastName}` })));
      if (d.ok) setDepts(((await d.json()) as { departments: Named[] }).departments.map((x) => ({ id: x.id, label: x.name })));
      if (g.ok) setDesigs(((await g.json()) as { designations: { id: string; title: string }[] }).designations.map((x) => ({ id: x.id, label: x.title })));
    })();
  }, []);

  async function create() {
    setBusy(true); setFieldErrors({});
    try {
      const res = await fetch("/api/workforce/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string[]> };
      if (!res.ok) { setFieldErrors(j.fields ?? {}); toast.error(j.error ?? t("error")); return; }
      toast.success(t("people.created"));
      setOpen(false); setForm(EMPTY); void load();
    } finally { setBusy(false); }
  }

  const card = "rounded-2xl border border-zinc-200/60 bg-white/60 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-950/40";
  const input = "mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700";
  const field = (key: keyof typeof EMPTY, label: string, type = "text") => (
    <label className="block text-xs font-semibold">{label}
      <input type={type} className={input} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} aria-invalid={!!fieldErrors[key]} />
      {fieldErrors[key] && <span className="text-[11px] font-normal text-rose-600">{fieldErrors[key]![0]}</span>}
    </label>
  );
  const select = (key: "departmentId" | "designationId" | "managerId", label: string, opts: Opt[]) => (
    <label className="block text-xs font-semibold">{label}
      <select className={input} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
        <option value="">—</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {fieldErrors[key] && <span className="text-[11px] font-normal text-rose-600">{fieldErrors[key]![0]}</span>}
    </label>
  );

  return (
    <WorkforcePageShell title={t("nav.people")} description={t("description")}
      actions={<Button size="sm" onClick={() => setOpen(true)} className="h-8 bg-teal-600 px-3 text-xs text-white hover:bg-teal-500"><Plus className="me-1.5 h-3.5 w-3.5" />{t("people.add")}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-zinc-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("people.search")} aria-label={t("people.search")} className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent ps-9 pe-3 text-sm dark:border-zinc-700" />
          </div>
          <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label={t("people.department")} className="h-10 rounded-xl border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700">
            <option value="">{t("people.allDepartments")}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {STATUS.map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }} className={cn("rounded-full px-3 py-1 text-xs font-semibold", status === s ? "bg-teal-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800")}>{s === "ALL" ? t("leave.tab.all") : t(`people.status.${s}`)}</button>)}
          <span className="ms-auto self-center text-xs text-zinc-500">{t("people.total", { count: total })}</span>
        </div>

        <div className={cn(card, "overflow-hidden")}>
          {loading ? <div className="h-40 animate-pulse" /> : rows.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">{t("people.empty")}</p> : (
            <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {rows.map((e) => (
                <li key={e.id}>
                  <Link href={`/workforce/people/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    <EmployeeAvatar firstName={e.firstName} lastName={e.lastName} avatarUrl={e.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.firstName} {e.lastName} {e.employeeCode && <span className="ms-1 font-mono text-[11px] font-normal text-zinc-400">{e.employeeCode}</span>}</p>
                      <p className="truncate text-xs text-zinc-500">{[e.designation?.title, e.department?.name, e.manager ? `↳ ${e.manager.firstName} ${e.manager.lastName}` : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[e.status])}>{t(`people.status.${e.status}`)}</span>
                    <ChevronRight className="h-4 w-4 text-zinc-400 rtl:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 text-xs">
            <button aria-label={t("sheet.prev")} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg p-2 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
            <span className="tabular-nums">{page} / {pages}</span>
            <button aria-label={t("sheet.next")} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg p-2 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={t("people.addTitle")} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-zinc-950 sm:max-w-lg sm:rounded-2xl">
            <h2 className="mb-3 text-base font-black">{t("people.addTitle")}</h2>
            <div className="grid grid-cols-2 gap-3">
              {field("firstName", t("people.first"))}{field("lastName", t("people.last"))}
              <div className="col-span-2">{field("email", t("people.email"), "email")}</div>
              {field("phone", t("people.phone"), "tel")}{field("joinDate", t("people.joinDate"), "date")}
              {select("departmentId", t("people.department"), depts)}{select("designationId", t("people.designation"), desigs)}
              <div className="col-span-2">{select("managerId", t("people.manager"), mgrs)}</div>
              <div className="col-span-2">{field("location", t("people.location"))}</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("leave.cancel")}</Button>
              <Button disabled={busy || !form.firstName.trim() || !form.lastName.trim()} onClick={() => void create()} className="bg-teal-600 text-white hover:bg-teal-500">{t("people.create")}</Button>
            </div>
          </div>
        </div>
      )}
    </WorkforcePageShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "./CompaniesShell";

type Member = { id: string; userId: string; groupRole: string; accessMode: string; user: { name: string | null; email: string | null }; workspaceAccess: { workspaceId: string; accessRole: string }[] };
type Data = { members: Member[]; companies: { workspaceId: string; name: string }[] };
const ROLES = ["OWNER", "ADMIN", "FINANCE_MANAGER", "ACCOUNTANT", "SALES_MANAGER", "OPERATIONS_MANAGER", "INVENTORY_MANAGER", "STAFF", "VIEWER"];
const GROUP_ROLES = ["GROUP_OWNER", "GROUP_ADMIN", "GROUP_FINANCE", "MEMBER"];

export function TeamView() {
  const t = useTranslations("CompaniesHub");
  const [data, setData] = useState<Data | null>(null);
  const [me, setMe] = useState<{ canManage: boolean; groupRole: string; userId: string }>({ canManage: false, groupRole: "MEMBER", userId: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("MEMBER");
  const [newAccess, setNewAccess] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/companies/team");
    const j = (await res.json().catch(() => ({}))) as { data?: Data; canManage?: boolean; groupRole?: string; currentUserId?: string; error?: string };
    if (!res.ok || !j.data) { setErr(j.error ?? t("error")); return; }
    setData(j.data); setMe({ canManage: !!j.canManage, groupRole: j.groupRole ?? "MEMBER", userId: j.currentUserId ?? "" });
  }, [t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client fetch on mount; state is set after the awaited response
  useEffect(() => { void load(); }, [load]);

  async function call(url: string, method: string, body: unknown, ok: string) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { toast.error(j.error ?? t("error")); return false; }
    toast.success(ok); await load(); return true;
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const access = Object.entries(newAccess).filter(([, r]) => r).map(([workspaceId, accessRole]) => ({ workspaceId, accessRole }));
    if (await call("/api/companies/team", "POST", { email, groupRole: newRole, accessMode: "SPECIFIC_COMPANIES", access }, t("team.added"))) { setEmail(""); setNewAccess({}); setNewRole("MEMBER"); }
  }

  if (err) return <p role="alert" className="text-sm text-rose-600">{err}</p>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />;
  const isOwner = me.groupRole === "GROUP_OWNER";
  const roleOptions = (current?: string) => GROUP_ROLES.filter((r) => isOwner || (r !== "GROUP_OWNER" && r !== "GROUP_ADMIN") || r === current);

  return (
    <div className="space-y-6">
      {!me.canManage && <p className="text-sm text-muted-foreground">{t("team.onlyOwn")}</p>}
      <section className={cn(cardClass, "overflow-hidden")} aria-labelledby="co-team">
        <h2 id="co-team" className="border-b border-border/70 px-4 py-3 text-sm font-black">{t("team.title")}</h2>
        <ul className="divide-y divide-border/70">
          {data.members.map((m) => (
            <li key={m.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.user.name ?? m.user.email}{m.userId === me.userId && <span className="ms-2 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold text-orange-700 dark:text-orange-300">{t("team.you")}</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                {me.canManage ? (
                  <select aria-label={t("team.groupRole")} value={m.groupRole} onChange={(e) => void call(`/api/companies/team/${m.id}`, "PATCH", { groupRole: e.target.value }, t("team.updated"))} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                    {roleOptions(m.groupRole).map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}
                  </select>
                ) : <span className="text-sm">{t(`team.role.${m.groupRole}`)}</span>}
                {me.canManage && <select aria-label={t("team.accessLabel")} value={m.accessMode} onChange={(e) => void call(`/api/companies/team/${m.id}`, "PATCH", { accessMode: e.target.value }, t("team.updated"))} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                  {["ALL_COMPANIES", "SPECIFIC_COMPANIES"].map((a) => <option key={a} value={a}>{t(`team.access.${a}`)}</option>)}
                </select>}
                {me.canManage && <Button size="sm" variant="ghost" onClick={() => setOpen(open === m.id ? null : m.id)} className="h-8 text-xs">{t("team.accessLabel")}</Button>}
                {me.canManage && m.userId !== me.userId && <Button size="sm" variant="ghost" onClick={() => void call(`/api/companies/team/${m.id}`, "DELETE", null, t("team.removed"))} className="h-8 text-xs text-rose-600">{t("team.remove")}</Button>}
              </div>
              {open === m.id && (
                <div className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
                  {m.accessMode === "ALL_COMPANIES" && <p className="text-xs text-muted-foreground sm:col-span-2">{t("team.access.ALL_COMPANIES")}</p>}
                  {data.companies.map((c) => {
                    const cur = m.workspaceAccess.find((a) => a.workspaceId === c.workspaceId)?.accessRole ?? "";
                    return (
                      <label key={c.workspaceId} className="text-xs font-semibold">{t("team.companyRole", { name: c.name })}
                        <select value={cur} disabled={m.accessMode === "ALL_COMPANIES"} onChange={(e) => {
                          const next = m.workspaceAccess.filter((a) => a.workspaceId !== c.workspaceId);
                          if (e.target.value) next.push({ workspaceId: c.workspaceId, accessRole: e.target.value });
                          void call(`/api/companies/team/${m.id}`, "PATCH", { access: next }, t("team.updated"));
                        }} className={inputClass}>
                          <option value="">{t("team.noAccess")}</option>{ROLES.map((r) => <option key={r} value={r}>{t(`biz.role.${r}`)}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {me.canManage && (
        <form onSubmit={(e) => void add(e)} className={cn(cardClass, "space-y-3 p-4")}>
          <h2 className="text-sm font-black">{t("team.add")}</h2>
          <p className="text-xs text-muted-foreground">{t("team.addHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">{t("team.email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></label>
            <label className="text-xs font-semibold">{t("team.groupRole")}
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={inputClass}>{roleOptions().map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}</select>
            </label>
            {data.companies.map((c) => (
              <label key={c.workspaceId} className="text-xs font-semibold">{t("team.companyRole", { name: c.name })}
                <select value={newAccess[c.workspaceId] ?? ""} onChange={(e) => setNewAccess({ ...newAccess, [c.workspaceId]: e.target.value })} className={inputClass}>
                  <option value="">{t("team.noAccess")}</option>{ROLES.map((r) => <option key={r} value={r}>{t(`biz.role.${r}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <Button type="submit" disabled={!email} className="h-10 bg-orange-600 text-white hover:bg-orange-500">{t("team.add")}</Button>
        </form>
      )}
    </div>
  );
}

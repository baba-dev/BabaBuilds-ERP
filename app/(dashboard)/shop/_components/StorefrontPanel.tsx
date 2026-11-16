"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, type ContentDraft, EMPTY_CONTENT, SOCIAL_PLATFORMS, type ShopSettings, toContentDraft } from "./shared";

const SWATCHES = ["#6366f1", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#111827"];

export function StorefrontPanel({ settings, abilities, onChanged }: { settings: ShopSettings; abilities: { canManageSettings: boolean; canManageContent: boolean }; onChanged: () => void }) {
  const t = useTranslations("ShopHub");
  const [slug, setSlug] = useState(settings.shopSlug ?? "");
  const [accent, setAccent] = useState(settings.shopAccentColor);
  const [tagline, setTagline] = useState(settings.shopTagline ?? "");
  const [live, setLive] = useState(settings.shopEnabled);
  const [savingSettings, setSavingSettings] = useState(false);
  const [content, setContent] = useState<{ initial: ContentDraft; draft: ContentDraft } | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const url = settings.shopSlug && typeof window !== "undefined" ? `${window.location.origin}/shop/${settings.shopSlug}` : null;

  useEffect(() => {
    let cancelled = false;
    api<{ content?: unknown }>("/api/shop/content").then((d) => { if (!cancelled) { const c = toContentDraft(d.content); setContent({ initial: c, draft: c }); } }).catch(() => { if (!cancelled) setContent({ initial: EMPTY_CONTENT, draft: EMPTY_CONTENT }); });
    return () => { cancelled = true; };
  }, []);

  const settingsDirty = slug !== (settings.shopSlug ?? "") || accent !== settings.shopAccentColor || tagline !== (settings.shopTagline ?? "") || live !== settings.shopEnabled;
  const contentDirty = useMemo(() => content !== null && JSON.stringify(content.draft) !== JSON.stringify(content.initial), [content]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api("/api/shop/settings", { method: "PATCH", body: JSON.stringify({ shopSlug: slug, shopAccentColor: accent, shopTagline: tagline, shopEnabled: live }) });
      toast.success(t("store.saved"));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("store.failed"));
    } finally {
      setSavingSettings(false);
    }
  };

  const saveContent = async () => {
    if (!content) return;
    setSavingContent(true);
    const d = content.draft;
    try {
      const r = await api<{ content?: unknown }>("/api/shop/content", {
        method: "PATCH",
        body: JSON.stringify({
          announcement: d.announcement.trim() || null, aboutMd: d.aboutMd.trim() || null, footerNote: d.footerNote.trim() || null,
          social: d.social.map((s) => ({ platform: s.platform, url: s.url.trim(), label: s.label.trim() || undefined })).filter((s) => s.url),
          faq: d.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a), showAiAssist: d.showAiAssist,
        }),
      });
      const c = toContentDraft(r.content);
      setContent({ initial: c, draft: c });
      toast.success(t("store.contentSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("store.failed"));
    } finally {
      setSavingContent(false);
    }
  };

  const r = settings.readiness;
  const checks: { ok: boolean; label: string; href?: string }[] = [
    { ok: Boolean(settings.shopSlug), label: t("ready.slug") },
    { ok: r.listedProducts > 0, label: t("ready.products", { count: r.listedProducts }), href: "/inventory?tab=products" },
    { ok: Boolean(r.gateway), label: r.gateway ? t("ready.gateway", { name: r.gateway === "RAZORPAY" ? "Razorpay" : "Stripe" }) : t("ready.noGateway"), href: "/settings" },
    { ok: r.email, label: r.email ? t("ready.email") : t("ready.noEmail"), href: "/settings" },
    { ok: settings.shopEnabled, label: t("ready.live") },
  ];

  const d = content?.draft ?? EMPTY_CONTENT;
  const patch = (p: Partial<ContentDraft>) => setContent((c) => (c ? { ...c, draft: { ...c.draft, ...p } } : c));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <section className="rounded-2xl border bg-card p-4">
          <h3 className="mb-3 font-medium">{t("ready.title")}</h3>
          <ul className="space-y-2 text-sm">
            {checks.map((c) => <li key={c.label} className="flex items-center gap-2">{c.ok ? <Check className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-500" />}{!c.ok && c.href ? <Link href={c.href} className="text-primary hover:underline">{c.label}</Link> : <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>}</li>)}
          </ul>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-4">
          <h3 className="font-medium">{t("store.title")}</h3>
          {url ? <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-2 text-sm"><span className="min-w-0 flex-1 truncate">{url}</span><Button size="icon" variant="ghost" aria-label={t("store.copy")} onClick={() => { void navigator.clipboard?.writeText(url).then(() => toast.success(t("store.copied"))); }}><Copy className="h-4 w-4" /></Button><Button asChild size="icon" variant="ghost" aria-label={t("store.open")}><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button></div> : null}
          <div><Label htmlFor="st-slug">{t("store.slug")}</Label><Input id="st-slug" value={slug} disabled={!abilities.canManageSettings} maxLength={40} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></div>
          <div><Label htmlFor="st-tag">{t("store.tagline")}</Label><Input id="st-tag" value={tagline} disabled={!abilities.canManageSettings} maxLength={180} onChange={(e) => setTagline(e.target.value)} /></div>
          <div><Label>{t("store.accent")}</Label><div className="mt-1 flex flex-wrap items-center gap-2">{SWATCHES.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={accent === c} disabled={!abilities.canManageSettings} onClick={() => setAccent(c)} className="h-7 w-7 rounded-full border-2" style={{ background: c, borderColor: accent === c ? "currentColor" : "transparent" }} />)}<input type="color" aria-label={t("store.customColor")} value={accent} disabled={!abilities.canManageSettings} onChange={(e) => setAccent(e.target.value)} className="h-7 w-9 cursor-pointer rounded border bg-transparent" /></div></div>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span><span className="font-medium">{t("store.live")}</span><span className="block text-xs text-muted-foreground">{t("store.liveHint")}</span></span><Switch checked={live} disabled={!abilities.canManageSettings} onCheckedChange={setLive} /></label>
          {abilities.canManageSettings ? <Button disabled={!settingsDirty || savingSettings} onClick={() => void saveSettings()}>{savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : t("store.save")}</Button> : null}
        </section>
      </div>

      <section className="space-y-4 rounded-2xl border bg-card p-4">
        <h3 className="font-medium">{t("content.title")}</h3>
        {content === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
          <>
            <div><Label htmlFor="ct-ann">{t("content.announcement")}</Label><Input id="ct-ann" value={d.announcement} disabled={!abilities.canManageContent} maxLength={200} onChange={(e) => patch({ announcement: e.target.value })} placeholder={t("content.announcementHint")} /></div>
            <div><Label htmlFor="ct-about">{t("content.about")}</Label><Textarea id="ct-about" rows={5} value={d.aboutMd} disabled={!abilities.canManageContent} maxLength={4000} onChange={(e) => patch({ aboutMd: e.target.value })} /></div>
            <div><Label htmlFor="ct-foot">{t("content.footer")}</Label><Input id="ct-foot" value={d.footerNote} disabled={!abilities.canManageContent} maxLength={300} onChange={(e) => patch({ footerNote: e.target.value })} /></div>
            <div className="space-y-2"><div className="flex items-center justify-between"><Label>{t("content.social")}</Label>{abilities.canManageContent && d.social.length < 8 ? <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => patch({ social: [...d.social, { platform: "website", url: "", label: "" }] })}><Plus className="h-3.5 w-3.5" />{t("content.add")}</Button> : null}</div>
              {d.social.map((s, i) => <div key={i} className="flex gap-2"><select aria-label={t("content.platform")} value={s.platform} disabled={!abilities.canManageContent} onChange={(e) => patch({ social: d.social.map((x, j) => (j === i ? { ...x, platform: e.target.value as typeof s.platform } : x)) })} className="h-9 rounded-md border bg-background px-2 text-sm">{SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select><Input aria-label="URL" value={s.url} disabled={!abilities.canManageContent} onChange={(e) => patch({ social: d.social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://" />{abilities.canManageContent ? <Button type="button" size="icon" variant="ghost" aria-label={t("content.remove")} onClick={() => patch({ social: d.social.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button> : null}</div>)}
            </div>
            <div className="space-y-2"><div className="flex items-center justify-between"><Label>{t("content.faq")}</Label>{abilities.canManageContent && d.faq.length < 12 ? <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => patch({ faq: [...d.faq, { q: "", a: "" }] })}><Plus className="h-3.5 w-3.5" />{t("content.add")}</Button> : null}</div>
              {d.faq.map((f, i) => <div key={i} className="space-y-1.5 rounded-xl border p-2"><div className="flex gap-2"><Input aria-label={t("content.question")} value={f.q} disabled={!abilities.canManageContent} maxLength={200} onChange={(e) => patch({ faq: d.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} placeholder={t("content.question")} />{abilities.canManageContent ? <Button type="button" size="icon" variant="ghost" aria-label={t("content.remove")} onClick={() => patch({ faq: d.faq.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button> : null}</div><Textarea aria-label={t("content.answer")} rows={2} value={f.a} disabled={!abilities.canManageContent} maxLength={1000} onChange={(e) => patch({ faq: d.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} placeholder={t("content.answer")} /></div>)}
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span><span className="font-medium">{t("content.ai")}</span><span className="block text-xs text-muted-foreground">{t("content.aiHint")}</span></span><Switch checked={d.showAiAssist} disabled={!abilities.canManageContent} onCheckedChange={(v) => patch({ showAiAssist: v })} /></label>
            {abilities.canManageContent ? <Button disabled={!contentDirty || savingContent} onClick={() => void saveContent()}>{savingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : t("content.save")}</Button> : null}
          </>
        )}
      </section>
    </div>
  );
}

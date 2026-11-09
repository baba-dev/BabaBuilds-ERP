"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { normalizeShopSlug } from "@/lib/settings/apply";
import { Field, Panel, ReadOnlyBanner, SaveBar, useSectionForm } from "../form-kit";
import type { SectionProps } from "./types";

export function ShopSection({ data, canManage }: SectionProps) {
  const t = useTranslations("SettingsHub.shop");
  const form = useSectionForm({
    section: "shop",
    initial: { shopEnabled: !!data.shopEnabled, shopSlug: data.shopSlug ?? "", shopTagline: data.shopTagline ?? "", shopAccentColor: data.shopAccentColor || "#6366f1" },
  });
  const { values: v, set, errors } = form;
  const slug = normalizeShopSlug(v.shopSlug);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="space-y-5">
      {!canManage ? <ReadOnlyBanner /> : null}
      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold" id="shop-switch-label">{t("enable")}</p><p className="text-xs text-muted-foreground">{t("enableHint")}</p></div>
          <Switch checked={v.shopEnabled} onCheckedChange={(c) => set("shopEnabled", c)} disabled={!canManage} aria-labelledby="shop-switch-label" />
        </div>
      </Panel>
      <Panel title={t("address")} description={t("addressHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label={t("slug")} error={errors.shopSlug} hint={slug ? `${origin}/shop/${slug}` : t("slugHint")}>{(p) => <Input {...p} value={v.shopSlug} maxLength={40} spellCheck={false} placeholder="my-company" onChange={(e) => set("shopSlug", e.target.value)} disabled={!canManage} className="font-mono" />}</Field>
          <Field className="sm:col-span-2" label={t("tagline")} hint={t("taglineHint")} error={errors.shopTagline}>{(p) => <Input {...p} value={v.shopTagline} maxLength={160} onChange={(e) => set("shopTagline", e.target.value)} disabled={!canManage} />}</Field>
          <Field label={t("accent")} hint={t("accentHint")} error={errors.shopAccentColor}>
            {(p) => (
              <div className="flex items-center gap-3">
                <input {...p} type="color" value={v.shopAccentColor} onChange={(e) => set("shopAccentColor", e.target.value)} disabled={!canManage} className="h-10 w-14 cursor-pointer rounded-md border border-border bg-transparent p-1" />
                <span className="font-mono text-sm">{v.shopAccentColor}</span>
              </div>
            )}
          </Field>
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t("content")}</p>
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            <Link href="/shop" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-300">{t("editContent")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link>
            {data.shopEnabled && data.shopSlug ? <a href={`/shop/${data.shopSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-300">{t("viewShop")}<ExternalLink className="size-3.5" aria-hidden /></a> : null}
          </div>
        </div>
      </Panel>
      <SaveBar {...form} onSave={form.save} onReset={form.reset} disabled={!canManage} />
    </div>
  );
}

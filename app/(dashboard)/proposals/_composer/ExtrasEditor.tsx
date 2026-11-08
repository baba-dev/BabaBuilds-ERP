"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { newKey, type DraftMedia, type DraftMilestone, type DraftSection } from "./composer-types";

type MilestonesProps = {
  milestones: DraftMilestone[];
  total: number | null;
  format: (n: number) => string;
  onChange: (m: DraftMilestone[]) => void;
};

export function MilestonesEditor({ milestones, total, format, onChange }: MilestonesProps) {
  const t = useTranslations("ProposalsHub.composer.milestones");
  const sum = milestones.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const diff = total === null ? 0 : Math.round((total - sum) * 100) / 100;
  const patch = (key: string, next: Partial<DraftMilestone>) => onChange(milestones.map((m) => (m.key === key ? { ...m, ...next } : m)));

  const splitEvenly = () => {
    if (!total || milestones.length === 0) return;
    const share = Math.floor((total / milestones.length) * 100) / 100;
    const amounts = milestones.map(() => share);
    amounts[amounts.length - 1] = Math.round((total - share * (milestones.length - 1)) * 100) / 100;
    onChange(milestones.map((m, i) => ({ ...m, amount: String(amounts[i]) })));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {milestones.map((m, i) => (
        <div key={m.key} className="grid gap-2 rounded-xl border border-border/70 bg-background p-3 sm:grid-cols-[1fr_8rem_9rem_auto]">
          <Input value={m.title} maxLength={200} onChange={(e) => patch(m.key, { title: e.target.value })} placeholder={t("titlePlaceholder")} aria-label={t("title", { n: i + 1 })} className="h-10" />
          <Input inputMode="decimal" value={m.amount} onChange={(e) => patch(m.key, { amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder={t("amount")} aria-label={t("amount")} className="h-10 tabular-nums" />
          <Input type="date" value={m.dueDate} onChange={(e) => patch(m.key, { dueDate: e.target.value })} aria-label={t("dueDate")} className="h-10" />
          <Button type="button" size="icon" variant="ghost" className="size-10 text-muted-foreground hover:text-rose-600" onClick={() => onChange(milestones.filter((x) => x.key !== m.key))} aria-label={t("remove", { n: i + 1 })}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="gap-1.5 rounded-xl" onClick={() => onChange([...milestones, { key: newKey(), title: "", amount: "", dueDate: "" }])}>
          <Plus className="size-4" aria-hidden /> {t("add")}
        </Button>
        {milestones.length > 1 && total ? (
          <Button type="button" variant="ghost" onClick={splitEvenly}>
            {t("splitEvenly")}
          </Button>
        ) : null}
        {milestones.length > 0 && total !== null && (
          <p role="status" className={cn("ms-auto text-sm font-medium tabular-nums", Math.abs(diff) <= 0.01 ? "text-emerald-600" : "text-amber-700 dark:text-amber-400")}>
            {Math.abs(diff) <= 0.01 ? t("balanced") : diff > 0 ? t("short", { amount: format(diff) }) : t("over", { amount: format(-diff) })}
          </p>
        )}
      </div>
    </div>
  );
}

export function SectionsEditor({ sections, onChange }: { sections: DraftSection[]; onChange: (s: DraftSection[]) => void }) {
  const t = useTranslations("ProposalsHub.composer.sections");
  const patch = (key: string, next: Partial<DraftSection>) => onChange(sections.map((s) => (s.key === key ? { ...s, ...next } : s)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {sections.map((s, i) => (
        <div key={s.key} className="space-y-2 rounded-xl border border-border/70 bg-background p-3">
          <div className="flex gap-2">
            <Input value={s.title} maxLength={200} onChange={(e) => patch(s.key, { title: e.target.value })} placeholder={t("titlePlaceholder")} aria-label={t("title", { n: i + 1 })} className="h-10" />
            <Button type="button" size="icon" variant="ghost" className="size-10 shrink-0 text-muted-foreground hover:text-rose-600" onClick={() => onChange(sections.filter((x) => x.key !== s.key))} aria-label={t("remove", { n: i + 1 })}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
          <Textarea value={s.body} maxLength={10000} rows={4} onChange={(e) => patch(s.key, { body: e.target.value })} placeholder={t("bodyPlaceholder")} aria-label={t("body", { n: i + 1 })} />
          <Input type="url" value={s.mediaUrl} maxLength={500} onChange={(e) => patch(s.key, { mediaUrl: e.target.value })} placeholder={t("mediaPlaceholder")} aria-label={t("media", { n: i + 1 })} className="h-10" />
        </div>
      ))}
      <Button type="button" variant="outline" className="gap-1.5 rounded-xl" onClick={() => onChange([...sections, { key: newKey(), title: "", body: "", mediaUrl: "" }])}>
        <Plus className="size-4" aria-hidden /> {t("add")}
      </Button>
    </div>
  );
}

export function MediaEditor({ media, onChange }: { media: DraftMedia[]; onChange: (m: DraftMedia[]) => void }) {
  const t = useTranslations("ProposalsHub.composer.media");
  const patch = (key: string, next: Partial<DraftMedia>) => onChange(media.map((m) => (m.key === key ? { ...m, ...next } : m)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {media.map((m, i) => (
        <div key={m.key} className="grid gap-2 rounded-xl border border-border/70 bg-background p-3 sm:grid-cols-[7rem_1fr_1fr_auto]">
          <select value={m.type} onChange={(e) => patch(m.key, { type: e.target.value === "video" ? "video" : "image" })} aria-label={t("type", { n: i + 1 })} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="image">{t("image")}</option>
            <option value="video">{t("video")}</option>
          </select>
          <Input type="url" value={m.url} maxLength={500} onChange={(e) => patch(m.key, { url: e.target.value })} placeholder={t("urlPlaceholder")} aria-label={t("url", { n: i + 1 })} className="h-10" />
          <Input value={m.title} maxLength={200} onChange={(e) => patch(m.key, { title: e.target.value })} placeholder={t("titlePlaceholder")} aria-label={t("title", { n: i + 1 })} className="h-10" />
          <Button type="button" size="icon" variant="ghost" className="size-10 text-muted-foreground hover:text-rose-600" onClick={() => onChange(media.filter((x) => x.key !== m.key))} aria-label={t("remove", { n: i + 1 })}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className="gap-1.5 rounded-xl" onClick={() => onChange([...media, { key: newKey(), type: "image", url: "", title: "" }])}>
        <Plus className="size-4" aria-hidden /> {t("add")}
      </Button>
    </div>
  );
}

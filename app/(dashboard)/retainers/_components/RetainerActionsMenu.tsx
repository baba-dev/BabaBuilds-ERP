"use client";

import { useTranslations } from "next-intl";
import { Ban, CirclePause, CirclePlay, Eye, FileText, Gauge, MoreHorizontal, Pencil, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RetainerListItemDto } from "@/lib/retainers/types";
import { availableActions, type RetainerRowAction } from "./retainer-utils";

const ICONS: Record<RetainerRowAction, typeof Eye> = {
  open: Eye, billNow: PlayCircle, edit: Pencil, pause: CirclePause, resume: CirclePlay, cancel: Ban, delete: Trash2, addUsage: Gauge, viewInvoices: FileText,
};
const DESTRUCTIVE: RetainerRowAction[] = ["cancel", "delete"];

export function RetainerActionsMenu({ row, onAction }: { row: RetainerListItemDto; onAction: (a: RetainerRowAction, r: RetainerListItemDto) => void }) {
  const t = useTranslations("RetainersHub.actions");
  const actions = availableActions(row.status, row.cyclesBilled);
  const primary: RetainerRowAction | null = actions.includes("billNow") ? "billNow" : actions.includes("resume") ? "resume" : null;
  const PrimaryIcon = primary ? ICONS[primary] : null;
  const regular = actions.filter((a) => !DESTRUCTIVE.includes(a));
  const destructive = actions.filter((a) => DESTRUCTIVE.includes(a));
  return (
    <div className="flex items-center justify-end gap-1.5">
      {primary && PrimaryIcon && (
        <Button type="button" size="sm" variant="outline" onClick={() => onAction(primary, row)} className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-semibold">
          <PrimaryIcon className="size-3.5 text-indigo-600 dark:text-indigo-300" aria-hidden />
          <span className="hidden 2xl:inline">{t(primary)}</span>
          <span className="sr-only 2xl:hidden">{t(primary)}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="size-8 rounded-lg" aria-label={`${t("more")} — ${row.name}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onAction("open", row)}><Eye className="size-4" aria-hidden /> {t("open")}</DropdownMenuItem>
          {regular.map((a) => {
            const Icon = ICONS[a];
            return <DropdownMenuItem key={a} onSelect={() => onAction(a, row)}><Icon className="size-4" aria-hidden /> {t(a)}</DropdownMenuItem>;
          })}
          {destructive.length > 0 && <DropdownMenuSeparator />}
          {destructive.map((a) => {
            const Icon = ICONS[a];
            return <DropdownMenuItem key={a} variant="destructive" onSelect={() => onAction(a, row)}><Icon className="size-4" aria-hidden /> {t(a)}</DropdownMenuItem>;
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

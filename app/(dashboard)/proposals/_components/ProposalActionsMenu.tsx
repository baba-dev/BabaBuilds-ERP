"use client";

import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, CheckCheck, Copy, CopyPlus, ExternalLink, Eye, FileOutput, Link2, MoreHorizontal, Pencil, RotateCcw, Send, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ProposalListItemDto } from "@/lib/proposals/types";
import { availableActions, type ProposalRowAction } from "./proposal-utils";

const ICONS: Record<ProposalRowAction, typeof Eye> = {
  open: Eye,
  edit: Pencil,
  send: Send,
  copyLink: Link2,
  preview: ExternalLink,
  duplicate: CopyPlus,
  accept: CheckCheck,
  decline: XCircle,
  reopen: RotateCcw,
  convert: FileOutput,
  viewInvoice: Copy,
  delete: Trash2,
  archive: Archive,
  unarchive: ArchiveRestore,
};

const DESTRUCTIVE: ProposalRowAction[] = ["delete", "decline"];

export function primaryAction(row: ProposalListItemDto): ProposalRowAction | null {
  const actions = availableActions(row.displayStatus, row.status, row.archived);
  if (row.archived) return null;
  if (actions.includes("convert")) return "convert";
  if (row.status === "DRAFT") return "send";
  return null;
}

export function ProposalActionsMenu({ row, onAction }: { row: ProposalListItemDto; onAction: (action: ProposalRowAction, row: ProposalListItemDto) => void }) {
  const t = useTranslations("ProposalsHub.actions");
  const actions = availableActions(row.displayStatus, row.status, row.archived);
  const primary = primaryAction(row);
  const regular = actions.filter((a) => !DESTRUCTIVE.includes(a));
  const destructive = actions.filter((a) => DESTRUCTIVE.includes(a));
  const PrimaryIcon = primary ? ICONS[primary] : null;

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
          <Button type="button" size="icon" variant="ghost" className="size-8 rounded-lg" aria-label={`${t("more")} — ${row.proposalNo}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onAction("open", row)}>
            <Eye className="size-4" aria-hidden /> {t("open")}
          </DropdownMenuItem>
          {regular.map((action) => {
            const Icon = ICONS[action];
            return (
              <DropdownMenuItem key={action} onSelect={() => onAction(action, row)}>
                <Icon className="size-4" aria-hidden /> {action === "send" && row.status !== "DRAFT" ? t("sendReminder") : t(action)}
              </DropdownMenuItem>
            );
          })}
          {destructive.length > 0 && <DropdownMenuSeparator />}
          {destructive.map((action) => {
            const Icon = ICONS[action];
            return (
              <DropdownMenuItem key={action} variant="destructive" onSelect={() => onAction(action, row)}>
                <Icon className="size-4" aria-hidden /> {t(action)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Banknote, BellRing, Copy, Download, Eye, MoreHorizontal, Send, Trash2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getBustedUrl } from "@/lib/cache-buster";
import type { InvoiceListItemDto } from "@/lib/invoices/types";

export type RowAction = "open" | "pay" | "send" | "remind" | "void" | "delete" | "copy";

/** Whether this invoice can still be hard-deleted (mirrors the server rule; the server decides). */
export function isDeletable(row: InvoiceListItemDto) {
  return row.status === "PENDING" && !row.sentAt && !row.lastReminderSentAt && Number(row.amountReceived) === 0;
}

export function RowActionsMenu({ row, onAction }: { row: InvoiceListItemDto; onAction: (action: RowAction, row: InvoiceListItemDto) => void }) {
  const t = useTranslations("Income.actions");
  const open = row.status === "PENDING" || row.status === "PARTIALLY_PAID";
  const isVoid = row.status === "VOID";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {open && (
        <Button type="button" size="sm" variant="outline" onClick={() => onAction("pay", row)} className="h-8 gap-1.5 rounded-lg px-2.5 text-xs font-semibold">
          <Banknote className="size-3.5 text-emerald-600" aria-hidden />
          <span className="hidden 2xl:inline">{t("recordPayment")}</span>
          <span className="sr-only 2xl:hidden">{t("recordPayment")}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="size-8 rounded-lg" aria-label={`${t("more")} — ${row.invoiceNumber}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => onAction("open", row)}>
            <Eye className="size-4" aria-hidden /> {t("open")}
          </DropdownMenuItem>
          {open && (
            <DropdownMenuItem onSelect={() => onAction("pay", row)}>
              <Banknote className="size-4" aria-hidden /> {t("recordPayment")}
            </DropdownMenuItem>
          )}
          {!isVoid && (
            <DropdownMenuItem onSelect={() => onAction("send", row)}>
              <Send className="size-4" aria-hidden /> {t("sendInvoice")}
            </DropdownMenuItem>
          )}
          {open && (
            <DropdownMenuItem onSelect={() => onAction("remind", row)}>
              <BellRing className="size-4" aria-hidden /> {t("sendReminder")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a href={getBustedUrl(row.pdfPath, row.createdAt)} target="_blank" rel="noopener noreferrer">
              <Download className="size-4" aria-hidden /> {t("download")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("copy", row)}>
            <Copy className="size-4" aria-hidden /> {t("copyNumber")}
          </DropdownMenuItem>
          {!isVoid && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onAction("void", row)}>
                <Ban className="size-4" aria-hidden /> {t("void")}
              </DropdownMenuItem>
              {isDeletable(row) && (
                <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete", row)}>
                  <Trash2 className="size-4" aria-hidden /> {t("delete")}
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Check,
  X,
  Edit2,
  Sparkles,
  Building2,
  Tags,
  PlusCircle,
  ChevronsUpDown,
} from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Transaction } from "@/app/(dashboard)/reconciliation/import/page";
import { useTranslations } from "next-intl";
import { InvoiceSplitEditor, type SplitLine } from "@/components/InvoiceSplitEditor";
import { cn } from "@/lib/utils";

const STANDARD_CATEGORIES = [
  "Advertising & Marketing",
  "Bank Fees & Charges",
  "Contractors & Freelancers",
  "Cost of Goods Sold (COGS)",
  "Insurance",
  "Meals & Entertainment",
  "Office Supplies",
  "Payroll & Benefits",
  "Professional Services (Legal/Accounting)",
  "Rent & Lease",
  "Software & IT",
  "Taxes & Licenses",
  "Travel",
  "Utilities",
  "Capital Injection (Income)",
  "Revenue / Sales (Income)",
  "Uncategorized",
];

interface ReconciliationRowProps {
  transaction: Transaction;
  onApprove: (item: Transaction) => void;
  onIgnore: (item: Transaction) => void;
  onPatchTransaction?: (id: string, patch: Partial<Transaction>) => void;
}

export function ReconciliationRow({
  transaction,
  onApprove,
  onIgnore,
  onPatchTransaction,
}: ReconciliationRowProps) {
  const t = useTranslations("Reconciliation");

  const [isEditing, setIsEditing] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  const [vendor, setVendor] = useState(transaction.aiVendor || transaction.ruleVendor || "Unknown Vendor");
  const [category, setCategory] = useState(transaction.aiCategory || transaction.ruleCategory || "Uncategorized");
  const [availableCategories, setAvailableCategories] = useState<string[]>(STANDARD_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [invoicePick, setInvoicePick] = useState<string | null>(
    transaction.matchId && transaction.type === "CREDIT" ? transaction.matchId : null,
  );
  const [linkExpenseId, setLinkExpenseId] = useState<string | null>(transaction.linkToExpenseId ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reconcile/categories");
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const names = Array.isArray(json.data) ? json.data : [];
        setAvailableCategories(Array.from(new Set([...STANDARD_CATEGORIES, ...names])).sort());
      } catch {
        /* keep standard */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const splitLines = transaction.invoiceSplits ?? [];

  const handleSplitsChange = useCallback(
    (lines: SplitLine[]) => {
      if (!onPatchTransaction) return;
      if (lines.length > 0) {
        onPatchTransaction(transaction.id, {
          invoiceSplits: lines,
          matchId: undefined,
          matchType: undefined,
          confidence: undefined,
        });
        setInvoicePick(null);
      } else {
        onPatchTransaction(transaction.id, { invoiceSplits: undefined });
      }
    },
    [onPatchTransaction, transaction.id],
  );

  const pickInvoice = (num: string) => {
    setInvoicePick(num);
    onPatchTransaction?.(transaction.id, {
      matchId: num,
      matchType: "INVOICE",
      invoiceSplits: undefined,
      confidence: transaction.confidence ?? 85,
    });
  };

  const handleSaveCategory = async (newCategory: string) => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    setCategory(trimmed);

    if (!availableCategories.includes(trimmed)) {
      try {
        await fetch("/api/reconcile/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch {
        /* ignore */
      }
      const updatedCategories = [...availableCategories, trimmed].sort();
      setAvailableCategories(updatedCategories);
    }

    setIsCategoryDropdownOpen(false);
    setSearchQuery("");
  };

  const buildApprovedPayload = (): Transaction => {
    const base: Transaction = {
      ...transaction,
      aiVendor: vendor,
      aiCategory: category,
      reason: isEditing ? "Manually verified & edited by user." : transaction.reason,
    };

    if (transaction.type === "CREDIT" && splitLines.length > 0) {
      const sum = splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      const ok = Math.abs(sum - transaction.amount) < 0.02;
      return {
        ...base,
        invoiceSplits: ok ? splitLines : splitLines,
        matchType: undefined,
        matchId: undefined,
      };
    }

    if (transaction.type === "CREDIT" && invoicePick) {
      return {
        ...base,
        matchType: "INVOICE",
        matchId: invoicePick,
        confidence: transaction.confidence ?? 85,
        invoiceSplits: undefined,
      };
    }
    if (transaction.type === "DEBIT" && linkExpenseId) {
      return {
        ...base,
        linkToExpenseId: linkExpenseId,
      };
    }
    return base;
  };

  const handleCommitApprove = () => {
    const payload = buildApprovedPayload();
    if (
      payload.type === "CREDIT" &&
      (payload.invoiceSplits?.length ?? 0) > 0
    ) {
      const sum = (payload.invoiceSplits ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
      if (Math.abs(sum - transaction.amount) >= 0.02) {
        window.alert("Split amounts must equal the bank deposit amount.");
        return;
      }
    }
    onApprove(payload);
    setIsEditing(false);
  };

  const isExactMatch = availableCategories.some(
    (c) => c.toLowerCase() === searchQuery.toLowerCase(),
  );

  const candidates = transaction.invoiceMatchCandidates ?? [];
  const expenseDupes = transaction.expenseMatchCandidates ?? [];

  return (
    <TableRow className="group transition-colors duration-200 hover:bg-amber-50/40 dark:hover:bg-amber-950/25 dark:border-zinc-800">
      <TableCell className="align-top pt-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{transaction.date}</p>
          <p
            className="font-mono text-xs font-medium text-zinc-900 dark:text-zinc-200 line-clamp-2"
            title={transaction.description}
          >
            {transaction.description}
          </p>
          <p
            className={`font-bold ${transaction.type === "DEBIT" ? "text-rose-600" : "text-emerald-600"}`}
          >
            {transaction.type === "DEBIT" ? "-" : "+"} ₹{transaction.amount.toLocaleString()}
          </p>
          {transaction.type === "CREDIT" && (
            <InvoiceSplitEditor
              bankAmount={transaction.amount}
              initialLines={splitLines}
              onChange={handleSplitsChange}
              className="mt-2"
            />
          )}
          {transaction.type === "CREDIT" && candidates.length > 0 && splitLines.length === 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-amber-800/80 dark:text-amber-400/90">
                Suggested invoices
              </p>
              <div className="flex flex-wrap gap-1">
                {candidates.slice(0, 3).map((c) => (
                  <Button
                    key={c.invoiceNumber}
                    type="button"
                    size="sm"
                    variant={invoicePick === c.invoiceNumber ? "default" : "outline"}
                    className={cn(
                      "h-7 text-xs",
                      invoicePick === c.invoiceNumber
                        ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600"
                        : "border-amber-300 text-amber-950 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40",
                    )}
                    onClick={() => pickInvoice(c.invoiceNumber)}
                  >
                    {c.invoiceNumber} ({Math.round(c.score)})
                  </Button>
                ))}
              </div>
            </div>
          )}
          {transaction.type === "DEBIT" && expenseDupes.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Possible duplicate expense</p>
              <div className="flex flex-wrap gap-1">
                {expenseDupes.slice(0, 2).map((e) => (
                  <Button
                    key={e.expenseId}
                    type="button"
                    size="sm"
                    variant={linkExpenseId === e.expenseId ? "default" : "outline"}
                    className={cn(
                      "h-7 text-xs",
                      linkExpenseId === e.expenseId
                        ? "bg-amber-600 text-white"
                        : "border-amber-300 dark:border-amber-800",
                    )}
                    onClick={() =>
                      setLinkExpenseId(linkExpenseId === e.expenseId ? null : e.expenseId)
                    }
                  >
                    {e.vendor}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </TableCell>

      <TableCell className="align-top pt-4">
        {isEditing ? (
          <div className="animate-in zoom-in-95 space-y-3 rounded-lg border border-amber-200 bg-white p-3 shadow-sm duration-200 dark:border-amber-900/50 dark:bg-zinc-900">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                <Building2 className="w-3 h-3" /> Vendor Name
              </label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="h-8 border-amber-200 text-sm focus-visible:ring-amber-500 dark:border-amber-900 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder={t("row_vendor_ph")}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                <Tags className="w-3 h-3" /> Category
              </label>

              <Popover open={isCategoryDropdownOpen} onOpenChange={setIsCategoryDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isCategoryDropdownOpen}
                    className="h-8 w-full justify-between border-amber-200 bg-white text-sm font-normal dark:border-amber-900 dark:bg-zinc-950 dark:text-zinc-300"
                  >
                    <span className="truncate">{category}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[300px] border-amber-200 p-0 dark:border-amber-900 dark:bg-zinc-900"
                  align="start"
                >
                  <Command className="dark:bg-zinc-900">
                    <CommandInput
                      placeholder="Search or create category..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      className="dark:text-zinc-100"
                    />
                    <CommandList>
                      <CommandEmpty className="py-2 text-center text-sm text-zinc-500">
                        {searchQuery && !isExactMatch ? (
                          <div className="px-4 py-2">
                            <p className="mb-2">No category found.</p>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950"
                              onClick={() => handleSaveCategory(searchQuery)}
                            >
                              <PlusCircle className="mr-2 h-4 w-4" />
                              Create &quot;{searchQuery}&quot;
                            </Button>
                          </div>
                        ) : (
                          "No results found."
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {availableCategories.map((cat) => (
                          <CommandItem
                            key={cat}
                            value={cat}
                            onSelect={(currentValue) => {
                              const original = availableCategories.find(
                                (c) => c.toLowerCase() === currentValue,
                              );
                              if (original) void handleSaveCategory(original);
                            }}
                            className="dark:aria-selected:bg-zinc-800 dark:text-zinc-300"
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${category === cat ? "text-amber-600 opacity-100 dark:text-amber-400" : "opacity-0"}`}
                            />
                            {cat}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 flex-1 text-xs dark:text-zinc-400 dark:hover:bg-zinc-800"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 flex-1 bg-amber-600 text-white hover:bg-amber-700"
                onClick={handleCommitApprove}
              >
                <Check className="mr-1 h-3 w-3" /> Save & Approve
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="group/edit cursor-text rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 transition-all duration-200 hover:border-amber-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-amber-800"
            onClick={() => setIsEditing(true)}
            title="Click to edit Vendor or Category"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-200 bg-white text-amber-900 shadow-sm transition-colors group-hover/edit:border-amber-400 dark:border-amber-900 dark:bg-zinc-950 dark:text-amber-200 dark:group-hover/edit:border-amber-600">
                {category}
              </Badge>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Vendor:</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{vendor}</span>

              <div className="ml-auto opacity-0 transition-opacity group-hover/edit:opacity-100">
                <Edit2 className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
              </div>
            </div>
            {transaction.reason && (
              <p className="mt-2 flex items-start gap-1 text-xs italic leading-snug text-amber-800/90 dark:text-amber-300/90">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0" /> {transaction.reason}
              </p>
            )}
          </div>
        )}
      </TableCell>

      <TableCell className="w-24 pt-4 text-right align-top">
        {!isEditing && (
          <div className="flex items-center justify-end gap-1.5 opacity-40 transition-opacity duration-300 group-hover:opacity-100">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 border-rose-200 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
              onClick={() => onIgnore(transaction)}
              title={t("row_ignore")}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 bg-amber-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-amber-600 active:scale-95 dark:bg-amber-600 dark:hover:bg-amber-500"
              onClick={handleCommitApprove}
              title={t("row_approve")}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

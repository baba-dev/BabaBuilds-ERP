"use client";

import { useState, useEffect } from "react";
import { 
  Check, 
  X, 
  Edit2, 
  Sparkles,
  Building2,
  Tags,
  PlusCircle,
  ChevronsUpDown
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
import { Transaction } from "@/app/reconciliation/page";
import { useTranslations } from "next-intl";

// --- 1. STANDARD ACCOUNTING CATEGORIES ---
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
  "Uncategorized"
];

interface ReconciliationRowProps {
  transaction: Transaction;
  onApprove: (item: Transaction) => void;
  onIgnore: (item: Transaction) => void;
}

export function ReconciliationRow({ transaction, onApprove, onIgnore }: ReconciliationRowProps) {
  const t = useTranslations('Reconciliation');
  
  // UI States
  const [isEditing, setIsEditing] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  
  // Data States
  const [vendor, setVendor] = useState(transaction.aiVendor || "Unknown Vendor");
  const [category, setCategory] = useState(transaction.aiCategory || "Uncategorized");
  const [availableCategories, setAvailableCategories] = useState<string[]>(STANDARD_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");

  // Load any custom categories
  useEffect(() => {
    try {
      const saved = localStorage.getItem('baba_erp_custom_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        setAvailableCategories(Array.from(new Set([...STANDARD_CATEGORIES, ...parsed])));
      }
    } catch (e) {
      console.error("Failed to load custom categories");
    }
  }, []);

  // Handlers
  const handleSaveCategory = (newCategory: string) => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    setCategory(trimmed);
    
    if (!availableCategories.includes(trimmed)) {
      const updatedCategories = [...availableCategories, trimmed].sort();
      setAvailableCategories(updatedCategories);
      const customOnly = updatedCategories.filter(c => !STANDARD_CATEGORIES.includes(c));
      localStorage.setItem('baba_erp_custom_categories', JSON.stringify(customOnly));
    }
    
    setIsCategoryDropdownOpen(false);
    setSearchQuery("");
  };

  const handleCommitApprove = () => {
    onApprove({
      ...transaction,
      aiVendor: vendor,
      aiCategory: category,
      reason: isEditing ? "Manually verified & edited by user." : transaction.reason
    });
    setIsEditing(false);
  };

  const isExactMatch = availableCategories.some(
    (c) => c.toLowerCase() === searchQuery.toLowerCase()
  );

  return (
    <TableRow className="group transition-colors duration-200 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 dark:border-zinc-800">
      
      {/* COLUMN 1: RAW DATA */}
      <TableCell className="align-top pt-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{transaction.date}</p>
          <p className="font-mono text-xs font-medium text-zinc-900 dark:text-zinc-200 line-clamp-2" title={transaction.description}>
            {transaction.description}
          </p>
          <p className={`font-bold ${transaction.type === 'DEBIT' ? 'text-rose-600' : 'text-emerald-600'}`}>
            {transaction.type === 'DEBIT' ? '-' : '+'} ₹{transaction.amount.toLocaleString()}
          </p>
        </div>
      </TableCell>

      {/* COLUMN 2: AI MAPPING & INLINE EDITING */}
      <TableCell className="align-top pt-4">
        {isEditing ? (
          // --- EDIT MODE ---
          <div className="bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-900/50 rounded-lg p-3 space-y-3 shadow-sm animate-in zoom-in-95 duration-200">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <Building2 className="w-3 h-3"/> Vendor Name
              </label>
              <Input 
                value={vendor} 
                onChange={(e) => setVendor(e.target.value)} 
                className="h-8 text-sm focus-visible:ring-purple-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" 
                placeholder={t('row_vendor_ph')}
                autoFocus
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <Tags className="w-3 h-3"/> Category
              </label>
              
              <Popover open={isCategoryDropdownOpen} onOpenChange={setIsCategoryDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isCategoryDropdownOpen}
                    className="w-full justify-between h-8 text-sm font-normal bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <span className="truncate">{category}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0 dark:bg-zinc-900 dark:border-zinc-800" align="start">
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
                              className="w-full bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300"
                              onClick={() => handleSaveCategory(searchQuery)}
                            >
                              <PlusCircle className="w-4 h-4 mr-2" />
                              Create "{searchQuery}"
                            </Button>
                          </div>
                        ) : "No results found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {availableCategories.map((cat) => (
                          <CommandItem
                            key={cat}
                            value={cat}
                            onSelect={(currentValue) => {
                              const original = availableCategories.find(c => c.toLowerCase() === currentValue);
                              if (original) handleSaveCategory(original);
                            }}
                            className="dark:aria-selected:bg-zinc-800 dark:text-zinc-300"
                          >
                            <Check className={`mr-2 h-4 w-4 ${category === cat ? "opacity-100 text-purple-600 dark:text-purple-400" : "opacity-0"}`} />
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
              <Button size="sm" variant="ghost" className="h-7 text-xs flex-1 dark:hover:bg-zinc-800 dark:text-zinc-400" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handleCommitApprove}>
                <Check className="w-3 h-3 mr-1" /> Save & Approve
              </Button>
            </div>
          </div>
        ) : (
          // --- VIEW MODE ---
          <div 
            className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 hover:border-purple-200 dark:hover:border-purple-900/50 rounded-lg p-3 space-y-2 cursor-text transition-all duration-200 group/edit"
            onClick={() => setIsEditing(true)}
            title="Click to edit Vendor or Category"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-white dark:bg-zinc-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900/50 shadow-sm transition-colors group-hover/edit:border-purple-400 dark:group-hover/edit:border-purple-700">
                {category}
              </Badge>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Vendor:</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{vendor}</span>
              
              <div className="ml-auto opacity-0 group-hover/edit:opacity-100 transition-opacity">
                <Edit2 className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
              </div>
            </div>
            {transaction.reason && (
              <p className="text-xs text-purple-600/80 dark:text-purple-400/80 italic flex items-start gap-1 leading-snug">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5" /> {transaction.reason}
              </p>
            )}
          </div>
        )}
      </TableCell>

      {/* COLUMN 3: ACTIONS */}
      <TableCell className="align-top pt-4 text-right w-24">
        {!isEditing && (
          <div className="flex items-center justify-end gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity duration-300">
            <Button 
              size="icon" 
              variant="outline" 
              className="h-8 w-8 text-rose-500 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 transition-colors"
              onClick={() => onIgnore(transaction)}
              title={t('row_ignore')}
            >
              <X className="w-4 h-4" />
            </Button>
            <Button 
              size="icon" 
              className="h-8 w-8 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
              onClick={handleCommitApprove}
              title={t('row_approve')}
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        )}
      </TableCell>
      
    </TableRow>
  );
}
"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowDownRight, ArrowUpRight, Tag, Info } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";

interface InventoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
}

export function InventoryDetailSheet({ open, onOpenChange, product }: InventoryDetailSheetProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { fCurrency, currency, locale } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);

  useEffect(() => {
    if (open && product) {
      fetchMovements(product.id);
    }
  }, [open, product]);

  const fetchMovements = async (productId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory/movements?productId=${productId}`);
      const data = await res.json();
      setMovements(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl font-black">{product.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 font-bold font-mono text-zinc-500 text-xs">
            <Tag className="w-3 h-3" /> {product.sku}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Current Stock</p>
            <p className={`text-3xl font-black ${product.currentStock === 0 ? 'text-rose-500' : 'text-zinc-900 dark:text-zinc-50'}`}>
              {product.currentStock} <span className="text-sm font-medium text-zinc-400">{product.unit || 'pcs'}</span>
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">Unit Cost</p>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
              {fCurrency(product.costPrice)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" /> Movement Ledger
          </h4>
          
          <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 dark:before:via-zinc-800 before:to-transparent">
            {isLoading ? (
              <p className="text-sm text-zinc-500 p-4 pl-10">Loading ledger...</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-zinc-500 p-4 pl-10">No movements recorded yet.</p>
            ) : (
              movements.map((mov) => (
                <div key={mov.id} className="relative flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-lg shadow-sm pl-12 z-10">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow-sm">
                    {mov.quantity > 0 ? (
                      <div className="w-full h-full rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                    ) : mov.quantity < 0 ? (
                      <div className="w-full h-full rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                        <ArrowDownRight className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center">
                        <Info className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{mov.reason || 'Manual Adjustment'}</p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 mt-1">{format(new Date(mov.createdAt), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <div className={`font-black ${mov.quantity > 0 ? 'text-emerald-600' : mov.quantity < 0 ? 'text-rose-600' : 'text-zinc-500'}`}>
                    {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  Package, Plus, Search, Archive, AlertTriangle, AlertCircle, ArrowLeft, ArrowUpRight, ArrowDownRight, Tag, Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import { QuickAdjustModal } from "@/components/inventory/QuickAdjustModal";
import { InventoryDetailSheet } from "@/components/inventory/InventoryDetailSheet";
import { MobileScanner } from "@/components/inventory/MobileScanner";

export default function InventoryHub() {
  const [view, setView] = useState<'list' | 'draft_po'>('list');
  const [isLoading, setIsLoading] = useState(true);

  // Globalization
  const { fCurrency, currency, locale } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);

  const [products, setProducts] = useState<any[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  
  // Modals state
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<any>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [view]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory/products');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load inventory data", err);
      toast.error("Failed to load inventory. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  const openAdjustModal = (product: any) => {
    setSelectedProductForAdjust(product);
    setAdjustModalOpen(true);
  };

  const openDetailSheet = (product: any) => {
    setSelectedProductForDetail(product);
    setDetailSheetOpen(true);
  };

  // Metrics
  const totalValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);
  const outOfStockCount = products.filter(p => p.currentStock === 0).length;
  const lowStockCount = products.filter(p => p.currentStock > 0 && p.currentStock <= p.safetyStock).length;

  const filteredProducts = useMemo(() => {
    if (!globalFilter) return products;
    const lower = globalFilter.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      p.sku.toLowerCase().includes(lower) || 
      (p.barcode && p.barcode.toLowerCase().includes(lower))
    );
  }, [products, globalFilter]);

  const productColumns: DataTableColumnDef<any>[] = [
    {
      id: "sku_name",
      header: "Product",
      accessor: (p) => `${p.sku} ${p.name}`,
      className: "px-6 py-4",
      cell: (p) => (
        <div className="cursor-pointer group flex flex-col items-start gap-1" onClick={() => openDetailSheet(p)}>
          <div className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors">
            {p.name}
          </div>
          <div className="text-xs font-bold uppercase tracking-tight text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> {p.sku}
          </div>
        </div>
      ),
    },
    {
      id: "stock",
      header: "Stock Level",
      sortable: true,
      sortAccessor: (p) => p.currentStock,
      cell: (p) => {
        let isDanger = p.currentStock === 0;
        let isWarning = p.currentStock > 0 && p.currentStock <= p.safetyStock;
        let fillWidth = Math.min((p.currentStock / (p.safetyStock * 3 || 10)) * 100, 100);
        
        return (
          <div className="flex items-center gap-3 w-32">
            <span className={`font-black text-sm ${isDanger ? 'text-rose-500' : isWarning ? 'text-amber-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
              {p.currentStock}
            </span>
            <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
              <div 
                className={`absolute left-0 top-0 h-full ${isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'} transition-all`}
                style={{ width: `${fillWidth}%` }}
              />
              {/* Safety Marker */}
              <div 
                className="absolute top-0 bottom-0 w-[2px] bg-red-500/50"
                style={{ left: `${Math.min((p.safetyStock / (p.safetyStock * 3 || 10)) * 100, 100)}%` }}
              />
            </div>
            {isDanger && <ArrowDownRight className="w-3 h-3 text-rose-500" />}
          </div>
        );
      },
    },
    {
      id: "status",
      header: <div className="text-center">Status</div>,
      accessor: (p) => p.status,
      className: "text-center",
      cell: (p) => {
        if (p.currentStock === 0) {
          return (
            <Badge className="bg-rose-500 text-white hover:bg-rose-600 border-none text-[10px] font-bold uppercase tracking-widest shadow-none px-2 py-0.5 animate-pulse">
              <AlertCircle className="w-3 h-3 mr-1" /> Out of Stock
            </Badge>
          );
        }
        if (p.currentStock <= p.safetyStock) {
          return (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400 border-none text-[10px] font-bold uppercase tracking-widest shadow-none px-2 py-0.5">
              <AlertTriangle className="w-3 h-3 mr-1" /> Low Stock
            </Badge>
          );
        }
        return (
          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 text-[10px] font-bold uppercase tracking-widest shadow-none px-2 py-0.5">
            In Stock
          </Badge>
        );
      },
    },
    {
      id: "value",
      header: "Value",
      sortable: true,
      sortAccessor: (p) => p.currentStock * p.costPrice,
      className: "font-black text-sm text-zinc-700 dark:text-zinc-300",
      cell: (p) => fCurrency(p.currentStock * p.costPrice),
    },
    {
      id: "actions",
      header: <div className="text-right px-6">Actions</div>,
      className: "text-right px-6",
      cell: (p) => (
        <div className="flex justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openAdjustModal(p)}
            className="text-xs font-bold uppercase tracking-widest h-8 px-3 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
          >
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 pb-20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        
        {/* Header & Metrics */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 max-w-7xl mx-auto w-full">
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                  <Archive className="w-6 h-6 text-indigo-700 dark:text-indigo-400" />
                </div>
                Inventory Overview
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">
                Real-time stock tracking and replenishment.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 px-5 py-2.5 rounded-xl shadow-sm text-center sm:text-right backdrop-blur-sm">
                <p className="text-xs uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-widest">Total Value</p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{fCurrency(totalValue)}</p>
              </div>
              <Button
                className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 h-12 px-6 shadow-md text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                onClick={() => toast.success("New product creation modal would open here.")}
              >
                <Plus className="w-4 h-4 mr-2" /> New Product
              </Button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input 
              autoFocus
              placeholder="Scan Barcode or Search SKU..." 
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 h-10 w-full bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500 font-bold"
            />
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" className="h-10 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-bold flex items-center gap-2" onClick={() => setScannerOpen(true)}>
              <Search className="w-4 h-4 text-indigo-500" /> Use Scanner
            </Button>
            {outOfStockCount > 0 && (
              <Badge variant="destructive" className="h-8 px-3 font-bold uppercase text-[10px] tracking-widest bg-rose-500 hover:bg-rose-600">
                <AlertCircle className="w-3 h-3 mr-1.5" /> {outOfStockCount} Need Restock
              </Badge>
            )}
            {lowStockCount > 0 && (
               <Badge className="h-8 px-3 font-bold uppercase text-[10px] tracking-widest bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400 hover:bg-amber-200">
               <AlertTriangle className="w-3 h-3 mr-1.5" /> {lowStockCount} Low Stock
             </Badge>
            )}
          </div>
        </div>

        <Card className="shadow-xl border-zinc-200 dark:border-zinc-800/80 overflow-hidden bg-white dark:bg-zinc-900/95 flex flex-col">
          <CardContent className="p-0">
            <DataTable
              columns={productColumns}
              data={filteredProducts}
              rowId={(row) => row.id}
              loading={isLoading}
              emptyTitle="No inventory found"
              emptyDescription="Add some products or import them."
            />
          </CardContent>
        </Card>

      </div>
      
      {/* Modals */}
      <QuickAdjustModal 
        open={adjustModalOpen} 
        onOpenChange={setAdjustModalOpen} 
        product={selectedProductForAdjust}
        onAdjusted={() => {
          fetchProducts();
          setAdjustModalOpen(false);
        }}
      />
      
      <InventoryDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        product={selectedProductForDetail}
      />

      <MobileScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(text) => {
          setGlobalFilter(text);
          toast.success("Barcode scanned successfully!");
        }}
      />
    </div>
  );
}

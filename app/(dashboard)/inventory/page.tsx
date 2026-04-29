"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import {
  Package, Plus, Search, Archive, AlertCircle, ArrowDownRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { InventoryDetailSheet } from "@/components/inventory/InventoryDetailSheet";
import { MobileScanner } from "@/components/inventory/MobileScanner";
import { ProductFormModal } from "@/components/inventory/ProductFormModal";
import { ProductCard } from "@/components/inventory/ProductCard";
import { QuickAdjustModal } from "@/components/inventory/QuickAdjustModal";
import { LayoutGrid, List, MapPin, RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent } from "@/components/ui/card";

type InventoryProduct = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  currentStock: number;
  safetyStock: number;
  status: string;
  location: string | null;
  costPrice: number;
};

type ProductColumn = {
  id: string;
  header: ReactNode;
  accessor?: (p: InventoryProduct) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortAccessor?: (p: InventoryProduct) => number | string;
  cell?: (p: InventoryProduct) => ReactNode;
};

export default function InventoryHub() {
  const [isLoading, setIsLoading] = useState(true);

  // Globalization
  const { fCurrency } = useFormat();

  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<InventoryProduct | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<InventoryProduct | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list'|'grid'>('list');

  const fetchProducts = useCallback(async ({ mode }: { mode: 'reset' | 'more' } = { mode: 'reset' }) => {
    setIsLoading(true);
    try {
      const limit = 200;
      const cursor = mode === 'more' ? nextCursor : null;
      const q = globalFilter.trim();
      const url = new URL('/api/inventory/products', window.location.origin);
      url.searchParams.set('limit', String(limit));
      if (cursor) url.searchParams.set('cursor', cursor);
      if (q) url.searchParams.set('q', q);

      const res = await fetch(url.toString());
      const data = await res.json();
      const cursorHeader = res.headers.get('X-Next-Cursor');

      const rows = Array.isArray(data) ? data : [];
      setProducts((prev) => (mode === 'more' ? [...prev, ...rows] : rows));
      const next = cursorHeader && cursorHeader.length > 0 ? cursorHeader : null;
      setNextCursor(next);
      setHasMore(Boolean(next) && rows.length > 0);
    } catch (err) {
      console.error("Failed to load inventory data", err);
      toast.error("Failed to load inventory. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, [globalFilter, nextCursor]);

  useEffect(() => {
    fetchProducts({ mode: 'reset' });
  }, [fetchProducts]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchProducts({ mode: 'reset' }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(id);
  }, [fetchProducts, globalFilter]);

  const openAdjustModal = (product: InventoryProduct) => {
    setSelectedProductForAdjust(product);
    setAdjustModalOpen(true);
  };

  const openDetailSheet = (product: InventoryProduct) => {
    setSelectedProductForDetail(product);
    setDetailSheetOpen(true);
  };

  // Metrics
  const totalValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);
  const outOfStockCount = products.filter(p => p.currentStock === 0).length;
  const filteredProducts = useMemo(() => products, [products]);

  const productColumns: ProductColumn[] = [
    {
      id: "sku",
      header: "SKU",
      accessor: (p) => p.sku,
      className: "px-6 py-4 w-[100px] text-zinc-500 font-mono text-xs font-bold",
    },
    {
      id: "product",
      header: "Product",
      accessor: (p) => p.name,
      className: "px-2 py-4",
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-extrabold text-[13px] text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-orange-600 dark:hover:text-orange-400 transition-colors" onClick={() => openDetailSheet(p)}>
            {p.name}
          </span>
          <span className="text-[11px] font-medium text-zinc-500">{p.category || "Uncategorized"}</span>
        </div>
      ),
    },
    {
      id: "stock",
      header: "Stock",
      sortable: true,
      sortAccessor: (p) => p.currentStock,
      className: "px-2 py-4 font-bold text-sm",
      cell: (p) => {
        const isDanger = p.currentStock === 0;
        const isCritical = p.currentStock > 0 && p.currentStock <= (p.safetyStock / 2);
        const isWarning = p.currentStock > 0 && p.currentStock <= p.safetyStock && !isCritical;
        return (
          <div className="flex items-center gap-1.5">
            <span className={isDanger || isCritical ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-zinc-900 dark:text-zinc-100'}>
              {p.currentStock}
            </span>
            {(isDanger || isCritical) && <ArrowDownRight className="w-3 h-3 text-rose-500" />}
          </div>
        );
      }
    },
    {
      id: "level",
      header: "Level",
      className: "px-2 py-4 w-[100px]",
      cell: (p) => {
        const isDanger = p.currentStock === 0;
        const isCritical = p.currentStock > 0 && p.currentStock <= (p.safetyStock / 2);
        const fillWidth = Math.min((p.currentStock / (p.safetyStock * 3 || 10)) * 100, 100);
        return (
          <div className="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full relative overflow-hidden">
            <div 
              className={`absolute left-0 top-0 h-full ${isDanger || isCritical ? 'bg-rose-500' : 'bg-zinc-800 dark:bg-zinc-200'}`}
              style={{ width: `${fillWidth}%` }}
            />
            <div className="absolute top-0 bottom-0 w-[1px] bg-red-500" style={{ left: `${Math.min((p.safetyStock / (p.safetyStock * 3 || 10)) * 100, 100)}%` }} />
          </div>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      accessor: (p) => p.status,
      className: "px-2 py-4 text-xs font-bold",
      cell: (p) => {
        if (p.currentStock === 0) return <span className="text-rose-600 text-[11px] font-medium tracking-wide">Out of Stock</span>;
        if (p.currentStock <= (p.safetyStock / 2)) return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] tracking-wide">Critical</span>;
        if (p.currentStock <= p.safetyStock) return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400 text-[10px] tracking-wide">Low Stock</span>;
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 text-[10px] tracking-wide">In Stock</span>;
      },
    },
    {
      id: "location",
      header: "Location",
      className: "px-2 py-4 text-[11px] font-medium text-zinc-500 whitespace-nowrap",
      cell: (p) => p.location ? (
        <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 opacity-60" /> {p.location}</span>
      ) : <span className="text-zinc-300 dark:text-zinc-700">-</span>
    },
    {
      id: "value",
      header: "Value",
      sortable: true,
      sortAccessor: (p) => p.currentStock * p.costPrice,
      className: "font-semibold text-[13px] text-zinc-800 dark:text-zinc-200 text-right px-6",
      cell: (p) => (
        <div className="flex items-center justify-end gap-3">
          {fCurrency(p.currentStock * (p.costPrice || 0))}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={(e) => { e.stopPropagation(); openAdjustModal(p); }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardPageShell
      title="Inventory Overview"
      description="Real-time stock tracking and replenishment."
      icon={<Archive className="w-6 h-6 text-accent-strong" />}
      kpiCard={
        <Card className="border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-zinc-900/80 shadow-sm">
          <CardContent className="px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700/80 dark:text-emerald-300/80">
              Total Value
            </p>
            <p className="text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-300">
              {fCurrency(totalValue)}
            </p>
          </CardContent>
        </Card>
      }
      primaryAction={
        <Button
          className="btn-primary w-full sm:w-auto shrink-0 text-xs uppercase tracking-wider h-10 px-5"
          onClick={() => setFormModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" /> New Product
        </Button>
      }
    >

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input 
              autoFocus
              placeholder="Scan Barcode or Search SKU..." 
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9 h-10 w-full bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-orange-500 font-bold"
            />
          </div>
          
          <div className="flex gap-2 items-center">
            <div className="hidden md:flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 rounded-xl shadow-sm h-10">
              <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('list')}
                className={`px-3 h-8 text-xs font-bold uppercase tracking-widest ${viewMode === 'list' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}`}
              >
                <List className="w-4 h-4 mr-1.5" /> List
              </Button>
              <Button 
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`px-3 h-8 text-xs font-bold uppercase tracking-widest ${viewMode === 'grid' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}`}
              >
                <LayoutGrid className="w-4 h-4 mr-1.5" /> Grid
              </Button>
            </div>
            
            {outOfStockCount > 0 && (
              <Badge variant="destructive" className="h-10 px-4 font-bold uppercase text-[11px] tracking-widest bg-rose-600 hover:bg-rose-700 shadow-sm ml-2">
                <AlertCircle className="w-4 h-4 mr-2" /> {outOfStockCount} Need Restock
              </Badge>
            )}
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
            {filteredProducts.map((p, i) => (
              <div key={p.id} style={{ animationDelay: `${i * 50}ms` }} className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
                <ProductCard 
                  product={p} 
                  onClick={openDetailSheet} 
                  onAdjust={openAdjustModal} 
                />
              </div>
            ))}
            {filteredProducts.length === 0 && !isLoading && (
              <div className="col-span-full py-20 text-center text-zinc-500">
                <p className="font-bold uppercase tracking-widest">No products found.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-950/50 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-zinc-200/80 dark:border-zinc-800/80">
                  <tr>
                    {productColumns.map(col => (
                      <th key={col.id as string} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-transparent">
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {filteredProducts.map(p => (
                    <tr key={p.id} className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors ${p.currentStock === 0 ? 'bg-rose-50/40 dark:bg-rose-500/5' : ''}`}>
                      {productColumns.map(col => (
                        <td key={col.id as string} className={col.className}>
                          {col.cell ? col.cell(p) : col.accessor ? col.accessor(p) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
            {hasMore && (
              <tr>
                <td colSpan={7} className="px-6 py-5 text-center">
                  <Button
                    variant="outline"
                    className="text-xs font-bold uppercase tracking-widest"
                    disabled={isLoading}
                    onClick={() => fetchProducts({ mode: 'more' })}
                  >
                    {isLoading ? "Loading..." : "Load more"}
                  </Button>
                </td>
              </tr>
            )}
                  {filteredProducts.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="p-0 border-none">
                        {/* 8.2 FIX: differentiate empty inventory vs empty search results */}
                        {products.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:bg-zinc-800 flex items-center justify-center mb-4 shadow-sm">
                              <Package className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
                            </div>
                            <p className="font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest text-sm">Inventory is empty</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 font-medium max-w-sm leading-relaxed">
                              Add your first product to start tracking stock levels, costs, and valuation.
                            </p>
                            <button
                              type="button"
                              onClick={() => setFormModalOpen(true)}
                              className="mt-5 px-5 py-2 text-xs font-bold uppercase tracking-widest bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg transition-all active:scale-95 shadow-sm"
                            >
                              <Plus className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
                              New Product
                            </button>
                          </div>
                        ) : (
                          <p className="text-center py-12 text-zinc-500 font-bold uppercase tracking-widest text-sm">No products match your search</p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
      <ProductFormModal
        open={formModalOpen}
        onOpenChange={setFormModalOpen}
        onSuccess={fetchProducts}
      />
    </DashboardPageShell>
  );
}

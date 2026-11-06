"use client";

import { useFormat } from "@/hooks/use-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tag, PackageSearch, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: any;
  onAdjust: (product: any) => void;
  onClick: (product: any) => void;
}

export function ProductCard({ product, onAdjust, onClick }: ProductCardProps) {
  const { fCurrency } = useFormat();

  const isDanger = product.currentStock === 0;
  const isWarning = product.currentStock > 0 && product.currentStock <= product.safetyStock;
  const fillWidth = Math.min((product.currentStock / (product.safetyStock * 3 || 10)) * 100, 100);

  return (
    <div 
      className={cn(
        "group relative flex flex-col bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer",
        isDanger ? "border-rose-200 dark:border-rose-900/50" : "border-zinc-200 dark:border-zinc-800"
      )}
      onClick={() => onClick(product)}
    >
      <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-950 overflow-hidden flex items-center justify-center p-6">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic or user-supplied image source; next/image remote config not applicable
          <img 
            src={product.imageUrl} 
            alt={product.name} 
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" 
          />
        ) : (
          <PackageSearch className="w-16 h-16 text-zinc-300 dark:text-zinc-700 transition-transform duration-500 group-hover:scale-110" />
        )}
        
        <div className="absolute top-3 left-3">
          {isDanger ? (
            <Badge className="bg-rose-500 hover:bg-rose-600 text-white border-none text-[10px] font-bold uppercase tracking-widest shadow-md px-2.5 py-1">
              <AlertCircle className="w-3 h-3 mr-1" /> Out of Stock
            </Badge>
          ) : isWarning ? (
            <Badge className="bg-amber-400 hover:bg-amber-500 text-amber-950 border-none text-[10px] font-bold uppercase tracking-widest shadow-md px-2.5 py-1">
              <AlertTriangle className="w-3 h-3 mr-1" /> Low Stock
            </Badge>
          ) : (
            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none text-[10px] font-bold uppercase tracking-widest shadow-md px-2.5 py-1">
              In Stock
            </Badge>
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 truncate text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {product.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 truncate">
              <Tag className="w-3 h-3 shrink-0" /> {product.sku}
              {product.location && (
                <>
                  <span className="opacity-50">•</span>
                  <span className="truncate">{product.location}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-indigo-600 dark:text-indigo-400 text-base">{fCurrency(product.baselinePrice || 0)}</p>
          </div>
        </div>

        <div className="mt-auto pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-black text-lg",
              isDanger ? "text-rose-500" : isWarning ? "text-amber-500" : "text-zinc-800 dark:text-zinc-200"
            )}>
              {product.currentStock}
            </span>
            <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
              <div 
                className={cn(
                  "absolute left-0 top-0 h-full transition-all duration-500",
                  isDanger ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${fillWidth}%` }}
              />
              {/* Safety Marker */}
              <div 
                className="absolute top-0 bottom-0 w-[2px] bg-black/20 dark:bg-white/20"
                style={{ left: `${Math.min((product.safetyStock / (product.safetyStock * 3 || 10)) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
             <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">
               Value: <span className="text-zinc-600 dark:text-zinc-300">{fCurrency(product.currentStock * (product.costPrice || 0))}</span>
             </div>
             <Button 
               variant="ghost" 
               size="sm" 
               className="h-8 px-2.5 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
               onClick={(e) => {
                 e.stopPropagation();
                 onAdjust(product);
               }}
             >
               <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> <span className="text-[10px] uppercase font-bold tracking-widest">Adjust</span>
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

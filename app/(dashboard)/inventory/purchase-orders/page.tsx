"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box, Truck, CheckCircle2, ChevronLeft, Loader2, ArrowRight } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import Link from "next/link";
import { getErrorMessage } from "@/lib/error-utils";

export default function PurchaseOrdersHub() {
  const [pos, setPos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  
  const { fCurrency } = useFormat();

  useEffect(() => {
    fetchPOs();
  }, []);

  const fetchPOs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/inventory/purchase-orders");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data as any)?.error || "Failed to load Purchase Orders");
      }
      setPos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load Purchase Orders");
    } finally {
      setIsLoading(false);
    }
  };

  const receivePO = async (poId: string) => {
    setReceivingId(poId);
    const toastId = toast.loading("Receiving stock and syncing expense...");
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncExpense: true }) // Automatically sync expense
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to receive.");
      
      toast.success(data.message, { id: toastId });
      fetchPOs();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err), { id: toastId });
    } finally {
      setReceivingId(null);
    }
  };

  return (
    <div className="flex-1 space-y-6 max-w-7xl mx-auto p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inventory" className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
            <ChevronLeft className="w-5 h-5 text-zinc-500" />
          </Link>
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-2">
              <Truck className="w-8 h-8 text-indigo-500" /> Procurement Hub
            </h2>
            <p className="text-zinc-500 font-medium">Manage pending and delivered purchase orders.</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 font-black tracking-wider">
              <tr>
                <th className="px-6 py-4">PO Number</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Items</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading POs...
                  </td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                    <Box className="w-12 h-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">No Purchase Orders yet</p>
                    <p className="text-sm">When stock runs low, AI will draft POs here.</p>
                  </td>
                </tr>
              ) : (
                pos.map((po) => (
                  <tr key={po.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-zinc-900 dark:text-zinc-100">{po.poNumber}</td>
                    <td className="px-6 py-4">{po.supplier}</td>
                    <td className="px-6 py-4">{format(new Date(po.createdAt), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4">
                      {po.items.length} SKUs
                    </td>
                    <td className="px-6 py-4 font-black">{fCurrency(po.totalAmount)}</td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={
                        po.status === 'DELIVERED' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' :
                        po.status === 'DRAFT' ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' : ''
                      }>
                        {po.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {po.status !== 'DELIVERED' ? (
                        <Button
                          size="sm"
                          onClick={() => receivePO(po.id)}
                          disabled={receivingId === po.id}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                        >
                          {receivingId === po.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                          Receive & Log Expense
                        </Button>
                      ) : (
                        <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Reconciled
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface QuickAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
  onAdjusted: () => void;
}

export function QuickAdjustModal({ open, onOpenChange, product, onAdjusted }: QuickAdjustModalProps) {
  const [adjustment, setAdjustment] = useState<string>("0");
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(adjustment);
    if (isNaN(qty) || qty === 0) {
      toast.error("Please enter a valid non-zero adjustment.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason for the adjustment.");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Adjusting stock...");

    try {
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity: qty,
          reason: reason
        })
      });

      if (!res.ok) throw new Error("Failed to adjust stock");

      toast.success("Stock adjusted successfully.", { id: toastId });
      setAdjustment("0");
      setReason("");
      onAdjusted();
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust stock.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  const currentStock = product.currentStock;
  const newStock = currentStock + (parseInt(adjustment) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Quick Adjust Stock</DialogTitle>
          <DialogDescription>
            Adjusting stock for <strong>{product.name}</strong> (SKU: {product.sku})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="flex items-center justify-between text-sm mb-6">
            <div className="text-center">
              <p className="text-zinc-500 font-medium">Current</p>
              <p className="text-2xl font-black">{currentStock}</p>
            </div>
            <div className="text-zinc-400 font-black text-xl">→</div>
            <div className="text-center">
              <p className="text-zinc-500 font-medium">New Level</p>
              <p className={`text-2xl font-black ${newStock < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{newStock}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="adjustment">Adjustment (+/-)</Label>
            <Input
              id="adjustment"
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              required
              className="text-lg font-bold"
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Adjustment</Label>
            <Input
              id="reason"
              placeholder="e.g., Found behind shelf, damaged"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || newStock < 0}>
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

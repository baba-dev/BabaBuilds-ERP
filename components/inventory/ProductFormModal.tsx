"use client";

import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, ImagePlus, X, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productToEdit?: any;
  onSuccess: () => void;
}

export function ProductFormModal({ open, onOpenChange, productToEdit, onSuccess }: ProductFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    category: "",
    unit: "pcs",
    baselinePrice: "",
    costPrice: "",
    currentStock: "",
    safetyStock: "5",
    barcode: "",
    location: "",
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (open) {
      if (productToEdit) {
        setFormData({
          sku: productToEdit.sku || "",
          name: productToEdit.name || "",
          description: productToEdit.description || "",
          category: productToEdit.category || "",
          unit: productToEdit.unit || "pcs",
          baselinePrice: productToEdit.baselinePrice?.toString() || "",
          costPrice: productToEdit.costPrice?.toString() || "",
          currentStock: productToEdit.currentStock?.toString() || "",
          safetyStock: productToEdit.safetyStock?.toString() || "5",
          barcode: productToEdit.barcode || "",
          location: productToEdit.location || "",
        });
        setPreviewUrl(productToEdit.imageUrl || null);
      } else {
        setFormData({
          sku: "", name: "", description: "", category: "", unit: "pcs",
          baselinePrice: "", costPrice: "", currentStock: "", safetyStock: "5",
          barcode: "", location: "",
        });
        setPreviewUrl(null);
      }
      setImageFile(null);
    }
  }, [open, productToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setImageFile(file);
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        toast.error("Please drop a valid image file.");
      }
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setPreviewUrl(productToEdit?.imageUrl || null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = new FormData();
    Object.entries(formData).forEach(([key, val]) => {
      payload.append(key, val);
    });

    if (imageFile) {
      payload.append("image", imageFile);
    }

    try {
      const url = productToEdit ? `/api/inventory/products/${productToEdit.id}` : `/api/inventory/products`;
      const method = productToEdit ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        body: payload
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      toast.success(`Product successfully ${productToEdit ? 'updated' : 'created'}.`);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-indigo-600" />
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <DialogTitle className="text-2xl font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
              <PackagePlus className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            {productToEdit ? 'Edit Product Catalog' : 'Add New Product'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col max-h-[80vh] overflow-y-auto custom-scrollbar">
          <div className="p-6 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            
            {/* Image Upload Zone */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Product Image</Label>
              </div>
              <div 
                className={cn(
                  "relative flex flex-col items-center justify-center w-full min-h-[160px] rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden group",
                  isDragging ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-500/10" : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900",
                  previewUrl ? "border-solid border-zinc-200 dark:border-zinc-800 bg-white" : ""
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !previewUrl && fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic or user-supplied image source; next/image remote config not applicable */}
                    <img src={previewUrl} alt="Preview" className="h-48 object-contain p-2" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                       <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} className="font-bold">
                         Change Image
                       </Button>
                       <Button type="button" variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); clearImage(); }} className="font-bold">
                         <X className="w-4 h-4 mr-1" /> Remove
                       </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 text-zinc-500 text-center pointer-events-none">
                    <div className="p-3 bg-white dark:bg-zinc-800 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                      <ImagePlus className="w-8 h-8 text-indigo-500/80" />
                    </div>
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Click or drag image to upload</p>
                    <p className="text-xs text-zinc-400 mt-1 uppercase tracking-widest font-medium">SVG, PNG, JPG or WEBP (max. 5MB)</p>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".jpg,.jpeg,.png,.webp" 
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="sku" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">SKU</Label>
                <Input id="sku" name="sku" required value={formData.sku} onChange={handleChange} className="h-11 font-bold text-sm bg-white dark:bg-zinc-950" placeholder="e.g. WH-1001" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Product Name</Label>
                <Input id="name" name="name" required value={formData.name} onChange={handleChange} className="h-11 font-bold text-sm bg-white dark:bg-zinc-950" placeholder="e.g. Wireless Headphones Pro" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Category</Label>
                <Input id="category" name="category" value={formData.category} onChange={handleChange} className="h-11 text-sm bg-white dark:bg-zinc-950" placeholder="e.g. Electronics" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Location</Label>
                <Input id="location" name="location" value={formData.location} onChange={handleChange} className="h-11 text-sm bg-white dark:bg-zinc-950" placeholder="e.g. Warehouse A" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="costPrice" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Cost Price</Label>
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-zinc-400 hover:text-indigo-500 transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-100 font-medium">Your internal total cost per unit (CoGS).</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input id="costPrice" name="costPrice" type="number" step="0.01" value={formData.costPrice} onChange={handleChange} className="h-11 font-bold text-sm bg-white dark:bg-zinc-950" placeholder="0.00" />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="baselinePrice" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Selling Price</Label>
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-zinc-400 hover:text-indigo-500 transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-100 font-medium">The default price quoted to clients on invoices.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input id="baselinePrice" name="baselinePrice" type="number" step="0.01" value={formData.baselinePrice} onChange={handleChange} className="h-11 font-bold text-sm bg-white dark:bg-zinc-950 text-indigo-600 dark:text-indigo-400" placeholder="0.00" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentStock" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Initial Stock</Label>
                <Input id="currentStock" name="currentStock" type="number" value={formData.currentStock} onChange={handleChange} disabled={!!productToEdit} className="h-11 font-bold text-sm bg-white dark:bg-zinc-950 disabled:opacity-50" placeholder="0" />
                {!!productToEdit && <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Use the Adjust tool to cycle-count stock after creation.</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="safetyStock" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Safety Threshold</Label>
                  <TooltipProvider>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-zinc-400 hover:text-indigo-500 transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-100 font-medium">When stock drops below this number, the PO engine triggers.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input id="safetyStock" name="safetyStock" type="number" value={formData.safetyStock} onChange={handleChange} className="h-11 font-bold text-sm bg-white dark:bg-zinc-950" placeholder="5" />
              </div>
            </div>

            <div className="space-y-2">
               <Label htmlFor="description" className="text-xs font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">Description (Optional)</Label>
               <Textarea id="description" name="description" value={formData.description} onChange={handleChange} className="resize-none h-20 text-sm bg-white dark:bg-zinc-950" placeholder="Internal product notes..." />
            </div>
            
          </div>

          <div className="p-6 md:p-8 bg-zinc-50 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 mt-auto">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-sm uppercase tracking-wider px-6 h-11" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm uppercase tracking-wider px-8 h-11 shadow-md">
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : productToEdit ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

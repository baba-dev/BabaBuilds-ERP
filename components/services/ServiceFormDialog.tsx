"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadField } from "@/components/forms/file-upload-field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { toast } from "sonner";

export type ServiceFormService = {
  id: string;
  name: string;
  description?: string;
  longDescription?: string;
  defaultPrice: number;
  imageUrl?: string;
  nicCode?: { id?: string; code: string; description: string };
  sacCode?: { id?: string; code: string; description: string; igstRate: number };
};

type TaxCodesResponse = {
  nic: Array<{ id: string; code: string; description: string }>;
  sac: Array<{ id: string; code: string; description: string; igstRate: number }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: ServiceFormService | null;
  onSuccess?: () => void;
};

const EMPTY_FORM = {
  name: "",
  description: "",
  longDescription: "",
  defaultPrice: "",
  nicCodeId: "",
  sacCodeId: "",
  imageUrl: "",
};

export function ServiceFormDialog({ open, onOpenChange, service, onSuccess }: Props) {
  const { currency, locale, taxLabel, countryCode = "Global" } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);
  const [taxCodes, setTaxCodes] = useState<TaxCodesResponse>({ nic: [], sac: [] });
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const industryLabel = countryCode === "IN" ? "NIC Code" : "Industry Class";
  const taxClassLabel = countryCode === "IN" ? "SAC/HSN Code" : "Service Class";

  useEffect(() => {
    fetch("/api/tax-codes")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setTaxCodes(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load tax codes", err);
        toast.error("Failed to load tax codes. Please refresh.");
      });
  }, []);

  const mappedNicCodeId = useMemo(() => {
    if (!service?.nicCode) return "";
    return service.nicCode.id || taxCodes.nic.find((c) => c.code === service.nicCode?.code)?.id || "";
  }, [service?.nicCode, taxCodes.nic]);

  const mappedSacCodeId = useMemo(() => {
    if (!service?.sacCode) return "";
    return service.sacCode.id || taxCodes.sac.find((c) => c.code === service.sacCode?.code)?.id || "";
  }, [service?.sacCode, taxCodes.sac]);

  useEffect(() => {
    if (!open) return;

    if (service) {
      setForm({
        name: service.name,
        description: service.description || "",
        longDescription: service.longDescription || "",
        defaultPrice: String(service.defaultPrice),
        nicCodeId: mappedNicCodeId,
        sacCodeId: mappedSacCodeId,
        imageUrl: service.imageUrl || "",
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setImageFile(null);
  }, [open, service, mappedNicCodeId, mappedSacCodeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const tid = toast.loading(service ? "Saving service..." : "Creating service...");

    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("description", form.description);
      fd.append("longDescription", form.longDescription);
      fd.append("defaultPrice", form.defaultPrice);
      fd.append("nicCodeId", form.nicCodeId);
      fd.append("sacCodeId", form.sacCodeId);
      if (imageFile) fd.append("serviceImage", imageFile);
      if (service) fd.append("existingImageUrl", form.imageUrl);

      const url = service ? `/api/services/${service.id}` : "/api/services";
      const method = service ? "PATCH" : "POST";
      const res = await fetch(url, { method, body: fd });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save service.", { id: tid });
        return;
      }

      onOpenChange(false);
      toast.success(service ? "Service updated." : "Service added to catalog.", { id: tid });
      onSuccess?.();
    } catch {
      toast.error("A network error occurred.", { id: tid });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950/95">
        <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800">
          <DialogHeader>
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                <Briefcase className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {service ? "Edit Service" : "Add Service"}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs font-medium">
                  {service ? "Update the service details." : "Configure your service for invoicing and proposals."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 bg-white dark:bg-zinc-950 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2 space-y-2">
                <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Service Name <span className="text-rose-500">*</span></Label>
                <Input placeholder="e.g. Monthly SEO Package" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-bold focus-visible:ring-indigo-500" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Base Price <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-zinc-400 font-bold text-sm">{currencySymbol}</span>
                  <Input type="number" min="0" placeholder="0" value={form.defaultPrice} onChange={(e) => setForm((f) => ({ ...f, defaultPrice: e.target.value }))} required className="h-10 pl-8 font-bold focus-visible:ring-indigo-500" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Short Description <span className="text-zinc-400 font-normal">(invoice / proposal)</span></Label>
              <Input placeholder="Brief one-line summary for invoices..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-10 focus-visible:ring-indigo-500" />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Detailed Description <span className="text-zinc-400 font-normal">(optional)</span></Label>
              <RichTextEditor value={form.longDescription} onChange={(html) => setForm((f) => ({ ...f, longDescription: html }))} placeholder="Describe deliverables, scope, and terms..." />
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Service Image <span className="text-zinc-400 font-normal">(optional)</span></Label>
              {form.imageUrl && !imageFile && (
                <div className="relative w-full h-32 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic or user-supplied image source; next/image remote config not applicable */}
                  <img src={form.imageUrl} alt="Current" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))} className="absolute top-2 right-2 p-1 bg-rose-600 text-white rounded-md text-[10px] font-bold">Remove</button>
                </div>
              )}
              <FileUploadField accept="image/*" onFileSelect={setImageFile} helpText="PNG, JPG or WEBP" inputClassName="dark:bg-zinc-900 dark:border-zinc-800" />
            </div>

            <div className="p-5 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80 rounded-xl space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Tax & Compliance Mapping</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{industryLabel}</Label>
                  <Select value={form.nicCodeId} onValueChange={(v) => setForm((f) => ({ ...f, nicCodeId: v }))}>
                    <SelectTrigger className="h-auto min-h-10 py-2 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-left"><SelectValue placeholder={`Select ${industryLabel}...`} /></SelectTrigger>
                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                      {taxCodes.nic.map((c) => (<SelectItem key={c.id} value={c.id}><span className="font-bold mr-2">{c.code}</span> — {c.description}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{taxClassLabel}</Label>
                  <Select value={form.sacCodeId} onValueChange={(v) => setForm((f) => ({ ...f, sacCodeId: v }))}>
                    <SelectTrigger className="h-auto min-h-10 py-2 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-left"><SelectValue placeholder={`Select ${taxLabel} category...`} /></SelectTrigger>
                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                      {taxCodes.sac.map((c) => (<SelectItem key={c.id} value={c.id}><span className="font-bold mr-2">{c.code}</span> — {c.description} ({c.igstRate}% {taxLabel})</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="text-xs font-bold uppercase tracking-widest px-5">Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-widest px-6">
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (service ? "Save Changes" : "Add to Catalogue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

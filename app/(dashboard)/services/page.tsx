"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Briefcase, FileText, Trash2, ShieldCheck, Tag, Loader2,
  Pencil, Store, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { FileUploadField } from "@/components/forms/file-upload-field";

type Service = {
  id: string; name: string; description?: string; longDescription?: string;
  defaultPrice: number; imageUrl?: string; showInShop: boolean;
  nicCode?: { code: string; description: string };
  sacCode?: { code: string; description: string; igstRate: number };
};
type PlanTier = "FREE" | "PRO" | "TEAM" | "ENTERPRISE";

const EMPTY_FORM = {
  name: "", description: "", longDescription: "", defaultPrice: "",
  nicCodeId: "", sacCodeId: "", showInShop: false, imageUrl: ""
};

export default function ServiceCatalog() {
  const { fCurrency, currency, locale, taxLabel, countryCode = "Global" } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);

  const [services, setServices] = useState<Service[]>([]);
  const [taxCodes, setTaxCodes] = useState<{ nic: Array<{ id: string; code: string; description: string }>; sac: Array<{ id: string; code: string; description: string; igstRate: number }> }>({ nic: [], sac: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<PlanTier>("FREE");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const publishedCount = services.filter((s) => s.showInShop).length;
  const canPublishMoreOnFree = planTier !== "FREE" || publishedCount < 3;

  const industryLabel = countryCode === "IN" ? "NIC Code" : "Industry Class";
  const taxClassLabel = countryCode === "IN" ? "SAC/HSN Code" : "Service Class";

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [srvRes, taxRes] = await Promise.all([fetch("/api/services"), fetch("/api/tax-codes")]);
      const [srvData, taxData] = await Promise.all([srvRes.json(), taxRes.json()]);
      setServices(Array.isArray(srvData) ? srvData : []);
      if (taxData && !taxData.error) setTaxCodes(taxData);
    } catch {
      toast.error("Failed to load service catalog. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.shopSlug) setShopSlug(d.shopSlug);
        setPlanTier((d.planTier as PlanTier) || "FREE");
      })
      .catch(() => {});
  }, [fetchData]);

  const openAddDialog = () => {
    setEditingService(null);
    setForm({ ...EMPTY_FORM });
    setImageFile(null);
    setOpen(true);
  };

  const openEditDialog = (srv: Service) => {
    setEditingService(srv);
    setForm({
      name: srv.name,
      description: srv.description || "",
      longDescription: srv.longDescription || "",
      defaultPrice: String(srv.defaultPrice),
      nicCodeId: srv.nicCode ? "" : "",
      sacCodeId: srv.sacCode ? "" : "",
      showInShop: srv.showInShop,
      imageUrl: srv.imageUrl || "",
    });
    setImageFile(null);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("description", form.description);
      fd.append("longDescription", form.longDescription);
      fd.append("defaultPrice", form.defaultPrice);
      fd.append("nicCodeId", form.nicCodeId);
      fd.append("sacCodeId", form.sacCodeId);
      fd.append("showInShop", String(form.showInShop));
      if (imageFile) fd.append("serviceImage", imageFile);
      if (editingService) fd.append("existingImageUrl", form.imageUrl);

      const url = editingService ? `/api/services/${editingService.id}` : "/api/services";
      const method = editingService ? "PATCH" : "POST";

      const res = await fetch(url, { method, body: fd });
      if (res.ok) {
        setOpen(false);
        toast.success(editingService ? "Service updated." : "Service added to catalog.");
        fetchData();
      } else {
        const err = await res.json();
        if (err?.code === "PLAN_LIMIT_REACHED" || err?.details?.requiresUpgrade) {
          toast.error(err?.details?.message || "Free plan allows up to 3 published services. Upgrade your plan to publish more.");
        } else {
          toast.error(err.error || "Failed to save service.");
        }
      }
    } catch {
      toast.error("A network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;
    setIsDeleting(true);
    const tid = toast.loading("Removing service...");
    try {
      const res = await fetch(`/api/services/${serviceToDelete}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Service removed.", { id: tid });
        fetchData();
      } else {
        toast.error("Failed to delete service.", { id: tid });
      }
    } catch {
      toast.error("Network error.", { id: tid });
    } finally {
      setIsDeleting(false);
      setServiceToDelete(null);
    }
  };

  const toggleShopStatus = async (srv: Service) => {
    if (!srv.showInShop && planTier === "FREE" && !canPublishMoreOnFree) {
      toast.error("Free plan allows up to 3 published services. Upgrade your plan to publish more.");
      return;
    }

    const fd = new FormData();
    fd.append("name", srv.name);
    fd.append("description", srv.description || "");
    fd.append("longDescription", srv.longDescription || "");
    fd.append("defaultPrice", String(srv.defaultPrice));
    fd.append("showInShop", String(!srv.showInShop));
    fd.append("existingImageUrl", srv.imageUrl || "");
    const res = await fetch(`/api/services/${srv.id}`, { method: "PATCH", body: fd });
    if (res.ok) {
      toast.success(srv.showInShop ? "Removed from shop." : "Now live in your shop!");
      fetchData();
    } else {
      const err = await res.json().catch(() => null);
      if (err?.code === "PLAN_LIMIT_REACHED" || err?.details?.requiresUpgrade) {
        toast.error(err?.details?.message || "Free plan allows up to 3 published services. Upgrade your plan to publish more.");
      } else {
        toast.error("Failed to update shop visibility.");
      }
    }
  };

  return (
    <DashboardPageShell
      title="Service Catalogue"
      description="Build and maintain your service offerings for invoices, proposals, and your shop."
      primaryAction={
        <div className="flex items-center gap-3">
          {shopSlug && (
            <Button
              onClick={() => window.open(`/shop/${shopSlug}`, "_blank")}
              variant="outline"
              className="hidden md:flex items-center gap-2 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs font-bold uppercase tracking-wider h-11"
            >
              <ExternalLink className="w-4 h-4" /> View Live Shop
            </Button>
          )}
          <Button
            onClick={openAddDialog}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 text-xs font-bold uppercase tracking-wider h-11 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 md:mr-2" /><span className="md:inline">Add Service</span>
          </Button>
        </div>
      }
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[680px] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950/95">
          <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800">
            <DialogHeader>
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                  <Briefcase className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {editingService ? "Edit Service" : "Add Service"}
                  </DialogTitle>
                  <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs font-medium">
                    {editingService ? "Update the service details and shop visibility." : "Configure your service for invoicing and the public shop."}
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
                <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Shop Description <span className="text-zinc-400 font-normal">(shown on your public shop)</span></Label>
                <RichTextEditor value={form.longDescription} onChange={(html) => setForm((f) => ({ ...f, longDescription: html }))} placeholder="Describe what's included, deliverables, turnaround time..." />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">Hero Image <span className="text-zinc-400 font-normal">(displayed on shop card)</span></Label>
                {form.imageUrl && !imageFile && (
                  <div className="relative w-full h-32 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 mb-2">
                    <img src={form.imageUrl} alt="Current" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))} className="absolute top-2 right-2 p-1 bg-rose-600 text-white rounded-md text-[10px] font-bold">Remove</button>
                  </div>
                )}
                <FileUploadField accept="image/*" onFileSelect={setImageFile} helpText="PNG, JPG or WEBP · recommended 1200×600px" inputClassName="dark:bg-zinc-900 dark:border-zinc-800" />
              </div>

              <div className="flex items-center justify-between p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2"><Store className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />Show in Public Shop</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Publish this service on your shop page so clients can browse and buy.
                    {planTier === "FREE" ? ` (${publishedCount}/3 published on Free plan)` : ""}
                  </p>
                </div>
                <Switch
                  checked={form.showInShop}
                  onCheckedChange={(v) => {
                    if (v && !form.showInShop && planTier === "FREE" && !canPublishMoreOnFree) {
                      toast.error("Free plan allows up to 3 published services. Upgrade your plan to publish more.");
                      return;
                    }
                    setForm((f) => ({ ...f, showInShop: v }));
                  }}
                  className="data-[state=checked]:bg-indigo-600"
                />
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="text-xs font-bold uppercase tracking-widest px-5">Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-widest px-6">
                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : (editingService ? "Save Changes" : "Add to Catalogue")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!serviceToDelete} onOpenChange={(o) => !o && setServiceToDelete(null)}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800 p-0 overflow-hidden">
          <div className="p-6">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-bold tracking-tight text-lg">Remove Service?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm font-medium mt-2 leading-relaxed">This will permanently remove this service from your catalogue. Past invoices using this service will not be affected.</AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
            <AlertDialogCancel disabled={isDeleting} className="text-xs font-bold uppercase tracking-widest px-5 mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} disabled={isDeleting} className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-widest px-6">
              {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Removing...</> : "Yes, Remove"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/20 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500/50" />
          <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Loading catalog...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((srv) => (
            <Card key={srv.id} className="group relative hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 overflow-hidden flex flex-col">
              {srv.imageUrl && (
                <div className="w-full h-40 overflow-hidden relative">
                  <img src={srv.imageUrl} alt={srv.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
              )}

              <div className="absolute top-3 right-3 flex gap-2 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
                <button onClick={() => openEditDialog(srv)} className="p-2 bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 rounded-lg shadow-sm hover:bg-indigo-600 hover:text-white active:scale-95 transition-all"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setServiceToDelete(srv.id)} className="p-2 bg-white/90 dark:bg-zinc-900/90 text-rose-500 rounded-lg shadow-sm hover:bg-rose-600 hover:text-white active:scale-95 transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>

              <CardHeader className={`pb-4 pt-5 px-5 border-b border-zinc-100 dark:border-zinc-800/80 ${srv.imageUrl ? "pt-4" : ""}`}>
                <div className="flex items-start justify-between gap-3 pr-10">
                  <CardTitle className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight">{srv.name}</CardTitle>
                  <button onClick={() => toggleShopStatus(srv)} title={srv.showInShop ? "Live in shop — click to unpublish" : "Click to publish to shop"} className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${srv.showInShop ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-rose-100 hover:text-rose-700" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-emerald-100 hover:text-emerald-700"}`}>
                    {srv.showInShop ? <><Eye className="w-2.5 h-2.5" /> LIVE</> : <><EyeOff className="w-2.5 h-2.5" /> PRIVATE</>}
                  </button>
                </div>
                {srv.description && <CardDescription className="line-clamp-2 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">{srv.description}</CardDescription>}
                <div className="mt-4"><Badge variant="secondary" className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-400/20 text-sm font-bold tracking-tight px-3 py-1">{fCurrency(srv.defaultPrice)}</Badge></div>
              </CardHeader>

              <CardContent className="p-0 flex-1 bg-zinc-50/50 dark:bg-zinc-950/30 text-xs">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  <div className="flex gap-3 items-start p-4">
                    <div className="w-6 h-6 rounded bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 border border-emerald-200/50 dark:border-emerald-800/50"><Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /></div>
                    <div className="min-w-0">
                      <p className="font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest text-xs mb-0.5">{taxClassLabel}: {srv.sacCode?.code || "Unmapped"}</p>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 line-clamp-1 uppercase">{srv.sacCode?.description || `No ${taxLabel} mapped`}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start p-4">
                    <div className="w-6 h-6 rounded bg-sky-100/50 dark:bg-sky-900/30 flex items-center justify-center shrink-0 border border-sky-200/50 dark:border-sky-800/50"><FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /></div>
                    <div className="min-w-0">
                      <p className="font-bold text-sky-800 dark:text-sky-400 uppercase tracking-widest text-xs mb-0.5">{industryLabel}: {srv.nicCode?.code || "Unmapped"}</p>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 line-clamp-1 uppercase">{srv.nicCode?.description || "No industry mapped"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {services.length === 0 && (
            <div className="col-span-full p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-4"><Briefcase className="w-7 h-7 text-zinc-400 dark:text-zinc-500" /></div>
                <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">Catalogue is empty</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm mx-auto font-medium leading-relaxed">Start by adding your first service. Toggle &quot;Show in Shop&quot; to publish it to your public storefront.</p>
                <Button onClick={openAddDialog} variant="outline" className="mt-6 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 text-xs font-bold uppercase tracking-wider h-10 px-6">Create First Service</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardPageShell>
  );
}

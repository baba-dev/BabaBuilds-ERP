"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Briefcase, FileText, Trash2, Tag,
  Pencil, Eye, EyeOff, ExternalLink, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFormat } from "@/hooks/use-format";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { ServiceFormDialog, ServiceFormService } from "@/components/services/ServiceFormDialog";

type Service = ServiceFormService;

export default function ServiceCatalog() {
  const { fCurrency, countryCode = "Global", taxLabel } = useFormat();

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [shopSlug, setShopSlug] = useState<string | null>(null);

  const industryLabel = countryCode === "IN" ? "NIC Code" : "Industry Class";
  const taxClassLabel = countryCode === "IN" ? "SAC/HSN Code" : "Service Class";

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const srvRes = await fetch("/api/services");
      const srvData = await srvRes.json();
      setServices(Array.isArray(srvData) ? srvData : []);
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
      .then((d) => { if (d.shopSlug) setShopSlug(d.shopSlug); })
      .catch(() => {});
  }, [fetchData]);

  const openAddDialog = () => {
    setEditingService(null);
    setOpen(true);
  };

  const openEditDialog = (srv: Service) => {
    setEditingService(srv);
    setOpen(true);
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
      <ServiceFormDialog
        open={open}
        onOpenChange={setOpen}
        service={editingService}
        onSuccess={fetchData}
      />

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

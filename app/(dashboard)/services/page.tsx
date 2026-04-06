"use client";

import { useState, useEffect } from "react";
import { Plus, Briefcase, FileText, Trash2, ShieldCheck, Tag, Pickaxe, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";

export default function ServiceCatalog() {
  const t = useTranslations('Services');
  const [services, setServices] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<{nic: any[], sac: any[]}>({ nic: [], sac: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // --- GLOBALIZATION ENGINE ---
  const { 
    fCurrency, 
    currency, 
    locale, 
    taxLabel, 
    countryCode = "Global" 
  } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);

  // Dynamic Compliance Labels
  const industryLabel = countryCode === "IN" ? "NIC Code" : "Industry Class";
  const taxClassLabel = countryCode === "IN" ? "SAC/HSN Code" : "Service Class";

  // Deletion State
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [nicCodeId, setNicCodeId] = useState("");
  const [sacCodeId, setSacCodeId] = useState("");

  // --- CUSTOM COMPLIANCE STATE ---
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customType, setCustomType] = useState<"NIC" | "SAC">("SAC");
  const [customCode, setCustomCode] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customIgst, setCustomIgst] = useState("18.0");
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;
        
        if (isFresh && data && path === '/services') {
          if (data.name || data.title) setName(data.name || data.title);
          if (data.price || data.amount) setDefaultPrice((data.price || data.amount).toString());
          if (data.description) setDescription(data.description);
          setOpen(true); 
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch(e) {
        console.error("Failed to parse AI payload");
      }
    }
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const srvRes = await fetch('/api/services');
      const srvData = await srvRes.json();
      setServices(Array.isArray(srvData) ? srvData : []);

      const taxRes = await fetch('/api/tax-codes');
      const taxData = await taxRes.json();
      if (taxData && !taxData.error) {
        setTaxCodes(taxData);
      }
    } catch (err) {
      console.error("Failed to load catalog data");
      toast.error("Failed to load service catalog. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, defaultPrice, nicCodeId, sacCodeId })
      });
      
      if (res.ok) {
        setOpen(false);
        setName(""); setDescription(""); setDefaultPrice(""); setNicCodeId(""); setSacCodeId("");
        toast.success("Service added to catalog successfully.");
        fetchData();
      } else {
        toast.error("Failed to save service.");
      }
    } catch (err) {
      toast.error("A network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;
    setIsDeleting(true);
    const toastId = toast.loading("Removing service from catalog...");
    
    try {
      const res = await fetch(`/api/services/${serviceToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success("Service removed.", { id: toastId });
        fetchData();
      } else {
        toast.error("Failed to delete service.", { id: toastId });
      }
    } catch (err) {
      toast.error("A network error occurred while deleting.", { id: toastId });
    } finally {
      setIsDeleting(false);
      setServiceToDelete(null); 
    }
  };

  const handleSaveCustomCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCustom(true);
    try {
      const res = await fetch('/api/tax-codes/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: customType,
          code: customCode,
          description: customDesc,
          countryCode,
          igstRate: parseFloat(customIgst)
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`${customType === 'SAC' ? 'Tax' : 'Industry'} code added.`);
        setIsCustomModalOpen(false);
        setCustomCode(""); setCustomDesc("");
        // Refresh and auto-select
        await fetchData();
        if (customType === 'SAC') setSacCodeId(data.id);
        else setNicCodeId(data.id);
      } else {
        toast.error(data.error || "Failed to save code.");
      }
    } catch (error) {
      toast.error("A network error occurred.");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const openCustomModal = (type: "NIC" | "SAC") => {
    setCustomType(type);
    setIsCustomModalOpen(true);
  };

  return (
    <DashboardPageShell
      title={t('title')}
      description={t.rich('description_rich', { taxLabel, tag: (chunks) => <strong className="text-zinc-700 dark:text-zinc-300">{chunks}</strong> })}
      actions={
        <Button 
          onClick={() => setOpen(true)} 
          className="w-full md:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 text-xs font-bold uppercase tracking-wider h-11 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4 md:mr-2" /> <span className="md:inline">{t('add_new')}</span>
        </Button>
      }
    >

        {/* MODAL: ADD SERVICE */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-[600px] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950/95 dark:backdrop-blur-xl">
            <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/80">
              <DialogHeader>
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                    <Briefcase className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t('config_title')}</DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs font-medium">{t('config_desc')}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-6 bg-white dark:bg-zinc-950">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="service-name" className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">
                      {t('display_name')} <span className="text-rose-500 dark:text-rose-400">*</span>
                    </Label>
                    <Input 
                      id="service-name"
                      placeholder={t('ph_name')} 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      required 
                      className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="base-rate" className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">
                      {t('base_rate')} <span className="text-rose-500 dark:text-rose-400">*</span>
                    </Label>
                    <div className="relative group">
                      <span className="absolute left-3.5 top-2.5 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-zinc-100 font-bold text-sm transition-colors">
                        {currencySymbol}
                      </span>
                      <Input 
                        id="base-rate"
                        type="number" 
                        min="0" 
                        placeholder={t('ph_rate')} 
                        value={defaultPrice} 
                        onChange={e => setDefaultPrice(e.target.value)} 
                        required 
                        className="h-10 pl-8 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-desc" className="font-bold text-zinc-700 dark:text-zinc-300 text-xs uppercase tracking-wider">{t('client_desc')}</Label>
                  <Input 
                    id="client-desc"
                    placeholder={t('ph_desc')} 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                  />
                </div>

                <div className="p-5 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/80 rounded-xl space-y-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-zinc-400 dark:text-zinc-500" /> {t('tax_mapping')}</h3>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="industry-code" className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                        {industryLabel}
                      </Label>
                      <Select 
                        value={nicCodeId} 
                        onValueChange={(val) => {
                          if (val === "ADD_CUSTOM") openCustomModal("NIC");
                          else setNicCodeId(val);
                        }}
                      >
                        <SelectTrigger id="industry-code" className="h-auto min-h-10 py-2 whitespace-normal bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus:ring-zinc-400 dark:focus:ring-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm text-left">
                          <SelectValue placeholder={t('ph_industry')} />
                        </SelectTrigger>
                        <SelectContent position="popper" className="dark:bg-zinc-900 dark:border-zinc-800">
                          <SelectItem value="ADD_CUSTOM" className="font-bold text-indigo-600 dark:text-indigo-400 border-b border-zinc-100 dark:border-zinc-800">
                             + Add Custom {industryLabel}
                          </SelectItem>
                          {taxCodes.nic.map(code => (
                             <SelectItem key={code.id} value={code.id} className="dark:focus:bg-zinc-800 text-sm">
                               <span className="font-bold mr-2">{code.code}</span> - {code.description}
                             </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="tax-code" className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                        {taxClassLabel}
                      </Label>
                      <Select 
                        value={sacCodeId} 
                        onValueChange={(val) => {
                          if (val === "ADD_CUSTOM") openCustomModal("SAC");
                          else setSacCodeId(val);
                        }}
                      >
                        <SelectTrigger id="tax-code" className="h-auto min-h-10 py-2 whitespace-normal bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus:ring-zinc-400 dark:focus:ring-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm w-full text-left">
                          <SelectValue placeholder={`Select ${taxLabel} category...`} />
                        </SelectTrigger>
                        <SelectContent position="popper" className="dark:bg-zinc-900 dark:border-zinc-800">
                          <SelectItem value="ADD_CUSTOM" className="font-bold text-indigo-600 dark:text-indigo-400 border-b border-zinc-100 dark:border-zinc-800">
                             + Add Custom {taxClassLabel}
                          </SelectItem>
                          {taxCodes.sac.map(code => (
                            <SelectItem key={code.id} value={code.id} className="dark:focus:bg-zinc-800 text-sm">
                              <span className="font-bold mr-2">{code.code}</span> - {code.description} ({code.igstRate}% {taxLabel})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 border-none text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-indigo-500/20 transition-all active:scale-95" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                       <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}</span>
                  ) : t('save_catalog')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* MODAL: CREATE CUSTOM COMPLIANCE CODE */}
        <Dialog open={isCustomModalOpen} onOpenChange={setIsCustomModalOpen}>
          <DialogContent className="sm:max-w-md dark:bg-zinc-900 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-500" />
                Add Custom {customType === 'SAC' ? taxClassLabel : industryLabel}
              </DialogTitle>
              <DialogDescription>
                Register a new {customType === 'SAC' ? 'Tax' : 'Industry'} classification for your business.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveCustomCode} className="space-y-5 pt-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">{customType} Code</Label>
                <Input 
                  placeholder={countryCode === 'IN' ? (customType === 'SAC' ? '99xxxx' : 'xxxxx') : 'Alphanumeric...'}
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value)}
                  required
                  className="font-bold"
                />
                <p className="text-[10px] text-zinc-500 font-medium italic">
                  {countryCode === 'IN' 
                    ? (customType === 'SAC' ? 'Official SAC must start with 99 and have 6 digits.' : 'NIC-2008 codes are 5 digits.')
                    : 'International codes should be alphanumeric (3-10 chars).'}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Description</Label>
                <Input 
                  placeholder="Official description..."
                  value={customDesc}
                  onChange={e => setCustomDesc(e.target.value)}
                  required
                />
              </div>
              {customType === 'SAC' && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">{taxLabel} Rate (%)</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    value={customIgst}
                    onChange={e => setCustomIgst(e.target.value)}
                    required
                  />
                </div>
              )}
              <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsCustomModalOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={isSavingCustom}>
                  {isSavingCustom ? "Saving..." : "Verify & Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ALERT DIALOG: DELETE CONFIRMATION */}
        <AlertDialog open={!!serviceToDelete} onOpenChange={(isOpen) => !isOpen && setServiceToDelete(null)}>
          <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800 sm:max-w-md p-0 overflow-hidden">
            <div className="p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-zinc-900 dark:text-zinc-50 font-bold tracking-tight text-lg">{t('delete_title')}</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mt-2 leading-relaxed">{t('delete_desc')}</AlertDialogDescription>
              </AlertDialogHeader>
            </div>
            <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
              <AlertDialogCancel 
                disabled={isDeleting} 
                className="mt-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5"
              >{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault(); 
                  confirmDelete();
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-500 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-rose-500/20 transition-all active:scale-95"
                disabled={isDeleting}
              >
                {isDeleting ? t('deleting') : t('yes_remove')}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* CATALOG GRID */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/20 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
             <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500/50" />
             <span className="text-xs font-bold uppercase tracking-widest animate-pulse">{t('loading_catalog')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((srv) => (
              <Card key={srv.id} className="group relative hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 overflow-hidden flex flex-col">
                <button 
                  onClick={() => setServiceToDelete(srv.id)}
                  aria-label={`Delete ${srv.name}`}
                  className="absolute top-4 right-4 p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hover:bg-rose-600 dark:hover:bg-rose-600 hover:text-white z-10 shadow-sm sm:shadow-none hover:shadow-md active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <CardHeader className="pb-4 pt-5 px-5 border-b border-zinc-100 dark:border-zinc-800/80">
                  <div className="pr-10">
                    <CardTitle className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight">
                      {srv.name}
                    </CardTitle>
                    {srv.description && (
                      <CardDescription className="line-clamp-2 mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                        {srv.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="mt-4 flex items-center">
                    <Badge variant="secondary" className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-400/20 text-sm font-bold tracking-tight px-3 py-1 shadow-sm">
                      {fCurrency(srv.defaultPrice)}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0 flex-1 bg-zinc-50/50 dark:bg-zinc-950/30 text-xs">
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    <div className="flex gap-3 items-start p-4 hover:bg-white dark:hover:bg-zinc-900/80 transition-colors">
                      <div className="w-6 h-6 rounded bg-emerald-100/50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 border border-emerald-200/50 dark:border-emerald-800/50">
                        <Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest text-xs mb-0.5">
                          {taxClassLabel}: {srv.sacCode?.code || t('unmapped')}
                        </p>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 line-clamp-1 uppercase">
                          {srv.sacCode?.description || t('no_tax_mapped', { taxLabel })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 items-start p-4 hover:bg-white dark:hover:bg-zinc-900/80 transition-colors">
                      <div className="w-6 h-6 rounded bg-sky-100/50 dark:bg-sky-900/30 flex items-center justify-center shrink-0 border border-sky-200/50 dark:border-sky-800/50">
                        <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sky-800 dark:text-sky-400 uppercase tracking-widest text-xs mb-0.5">
                          {industryLabel}: {srv.nicCode?.code || t('unmapped')}
                        </p>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 line-clamp-1 uppercase">
                          {srv.nicCode?.description || t('no_industry_mapped')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {services.length === 0 && (
              <div className="col-span-full p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-4 shadow-sm">
                    <Briefcase className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
                  </div>
                  <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">{t('catalog_empty')}</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm mx-auto font-medium leading-relaxed">{t('catalog_empty_desc')}</p>
                  <Button 
                    onClick={() => setOpen(true)} 
                    variant="outline" 
                    className="mt-6 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 h-10 px-6"
                  >{t('create_first')}</Button>
                </div>
              </div>
            )}
          </div>
        )}
    </DashboardPageShell>
  );
}

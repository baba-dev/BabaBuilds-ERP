"use client";

import { useState, useEffect, useMemo } from "react";
import { format, addMonths } from "date-fns";
import {
  Repeat, Plus, ArrowLeft, Building2, Briefcase,
  Sparkles, CalendarClock, PlayCircle, PauseCircle,
  Settings2, Activity, CheckCircle2, Trash2, Pencil, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { TaxRateModal } from "@/components/invoice/tax-rate-modal";

export default function RetainersHub() {
  const t = useTranslations('Retainers');
  const [view, setView] = useState<'list' | 'wizard'>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- GLOBALIZATION ENGINE ---
  const {
    fCurrency,
    currency,
    locale,
    dateFormat = "dd/MM/yyyy"
  } = useFormat();

  const currencySymbol = getCurrencySymbol(currency, locale);

  // Data States
  const [retainers, setRetainers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);

  // Wizard Form States
  const [clientId, setClientId] = useState("");
  const [serviceTemplateId, setServiceTemplateId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [autoAppendMonth, setAutoAppendMonth] = useState(true);

  // Deletion State
  const [retainerToDelete, setRetainerToDelete] = useState<string | null>(null);

  // Edit State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [retainerToEdit, setRetainerToEdit] = useState<any>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editFrequency, setEditFrequency] = useState("MONTHLY");
  const [isEditing, setIsEditing] = useState(false);
  const [taxRateModalOpen, setTaxRateModalOpen] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState("");
  const [taxRateMeta, setTaxRateMeta] = useState<{ taxLabel?: string; countryCode?: string; candidates?: number[] }>({});

  // Default to the 1st of the *next* month
  const [nextBillingDate, setNextBillingDate] = useState(() => {
    const nextMonth = addMonths(new Date(), 1);
    return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1), 'yyyy-MM-dd');
  });

  useEffect(() => {
    fetchData();
  }, [view]);

  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    if (clients.length === 0) return;

    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;

        if (isFresh && data && path === '/retainers') {
          if (data.amount) setAmount(data.amount.toString());

          if (data.client) {
            const matchedClient = clients.find(c => c.name.toLowerCase().includes(data.client.toLowerCase()));
            if (matchedClient) setClientId(matchedClient.id.toString());
          }
          setView('wizard');
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch (e) {
        console.error("Failed to parse AI payload");
      }
    }
  }, [clients]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (view === 'list') {
        const res = await fetch('/api/retainers');
        const data = await res.json();
        setRetainers(Array.isArray(data) ? data : []);
      } else {
        const [clientRes, catRes] = await Promise.all([
          fetch('/api/clients?limit=100'),
          fetch('/api/services?limit=100')
        ]);
        const clientData = await clientRes.json();
        const catData = await catRes.json();
        const parsedClients = Array.isArray(clientData) ? clientData : clientData?.data;
        const parsedCatalog = Array.isArray(catData) ? catData : catData?.data;
        setClients(Array.isArray(parsedClients) ? parsedClients : []);
        setCatalog(Array.isArray(parsedCatalog) ? parsedCatalog : []);
      }
    } catch (err) {
      console.error("Failed to load retainer data", err);
      toast.error("Failed to load retainer configurations. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedService = useMemo(() => catalog.find(c => c.id === serviceTemplateId), [catalog, serviceTemplateId]);

  useEffect(() => {
    if (selectedService) setAmount(selectedService.defaultPrice.toString());
  }, [selectedService]);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    const toastId = toast.loading(newStatus === 'ACTIVE' ? "Resuming retainer..." : "Pausing retainer...");

    const previousRetainers = [...retainers];
    setRetainers(retainers.map(r => r.id === id ? { ...r, status: newStatus } : r));

    try {
      const res = await fetch(`/api/retainers/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success(`Retainer ${newStatus.toLowerCase()}.`, { id: toastId });
    } catch (err) {
      setRetainers(previousRetainers);
      toast.error("Failed to update status", { id: toastId });
    }
  };

  const confirmDeleteRetainer = async () => {
    if (!retainerToDelete) return;
    const id = retainerToDelete;
    setRetainerToDelete(null);

    const toastId = toast.loading("Deleting retainer engine...");

    const previousRetainers = [...retainers];
    setRetainers(retainers.filter(r => r.id !== id));

    try {
      const res = await fetch(`/api/retainers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Retainer loop destroyed.", { id: toastId });
    } catch (err) {
      setRetainers(previousRetainers);
      toast.error("Failed to delete retainer.", { id: toastId });
    }
  };

  const openEditModal = (ret: any) => {
    setRetainerToEdit(ret);
    setEditServiceName(ret.serviceName);
    setEditAmount(ret.amount.toString());
    setEditFrequency(ret.frequency);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retainerToEdit) return;

    setIsEditing(true);
    const toastId = toast.loading("Updating retainer...");

    const previousRetainers = [...retainers];
    setRetainers(retainers.map(r =>
      r.id === retainerToEdit.id
        ? { ...r, serviceName: editServiceName, amount: parseFloat(editAmount), frequency: editFrequency }
        : r
    ));

    try {
      const res = await fetch(`/api/retainers/${retainerToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceName: editServiceName,
          amount: editAmount,
          frequency: editFrequency
        })
      });

      if (!res.ok) throw new Error("Failed to update");

      toast.success("Retainer updated successfully.", { id: toastId });
      setEditModalOpen(false);
    } catch (err) {
      setRetainers(previousRetainers);
      toast.error("Failed to update retainer.", { id: toastId });
    } finally {
      setIsEditing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !serviceTemplateId || !amount) return toast.error("Please fill all required fields.");

    setIsSubmitting(true);
    const toastId = toast.loading("Configuring retainer...");

    try {
      const res = await fetch('/api/retainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          serviceTemplateId,
          serviceName: selectedService?.name,
          amount: parseFloat(amount),
          frequency,
          autoAppendMonth,
          nextBillingDate: new Date(nextBillingDate).toISOString()
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 422 && payload?.code === "TAX_RATE_REQUIRED") {
          setTaxRateMeta({
            taxLabel: payload.taxLabel,
            countryCode: payload.countryCode,
            candidates: payload.candidates || [],
          });
          setTaxRateModalOpen(true);
          toast.dismiss(toastId);
          return;
        }
        throw new Error(payload?.error || "Failed to create retainer");
      }

      toast.success("Retainer engine activated!", { id: toastId });
      setView('list');
      setClientId(""); setServiceTemplateId(""); setAmount(""); setAutoAppendMonth(true);
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTaxRateConfirm = async () => {
    if (!taxRateInput || !clientId || !serviceTemplateId || !amount) return;
    setIsSubmitting(true);
    const toastId = toast.loading("Configuring retainer...");
    try {
      const res = await fetch('/api/retainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          serviceTemplateId,
          serviceName: selectedService?.name,
          amount: parseFloat(amount),
          frequency,
          autoAppendMonth,
          nextBillingDate: new Date(nextBillingDate).toISOString(),
          taxRateOverride: Number(taxRateInput),
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to create retainer");
      toast.success("Retainer engine activated!", { id: toastId });
      setTaxRateModalOpen(false);
      setTaxRateInput("");
      setView('list');
      setClientId(""); setServiceTemplateId(""); setAmount(""); setAutoAppendMonth(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to create retainer", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe Date Formatting
  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, 'd').replace(/Y/g, 'y');

  // --- RENDER WIZARD ---
  if (view === 'wizard') {
    return (
      <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 pb-20 p-4 md:p-8 transition-colors duration-300">
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => setView('list')} aria-label="Back to Retainers List" className="rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 active:scale-95 transition-transform">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{t('configure')}</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider mt-0.5">{t('configure_desc')}</p>
            </div>
          </div>

          <Card className="shadow-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-emerald-500 w-full" />
            <form onSubmit={handleSubmit}>
              <CardContent className="p-6 md:p-8 space-y-8">

                {/* Section 1: The Who & What */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                  <div className="space-y-2">
                    <Label htmlFor="retainer-client" className="text-zinc-700 dark:text-zinc-300 font-bold uppercase text-xs tracking-widest">{t('select_client_label')}</Label>
                    <Select value={clientId} onValueChange={setClientId} required>
                      <SelectTrigger id="retainer-client" className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 h-12 font-bold shadow-sm focus:ring-indigo-500/30">
                        <SelectValue placeholder={t('select_client')} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        {clients.map(c => (
                          <SelectItem key={c.id} value={String(c.id)} className="dark:focus:bg-zinc-800 dark:text-zinc-100 py-2.5">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                              <span className="font-bold">{c.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retainer-service" className="text-zinc-700 dark:text-zinc-300 font-bold uppercase text-xs tracking-widest">{t('service_delivered')}</Label>
                    <Select value={serviceTemplateId} onValueChange={setServiceTemplateId} required>
                      <SelectTrigger id="retainer-service" className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 h-12 font-bold shadow-sm focus:ring-indigo-500/30">
                        <SelectValue placeholder={t('select_service')} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        {catalog.map(cat => (
                          <SelectItem key={cat.id} value={String(cat.id)} className="dark:focus:bg-zinc-800 dark:text-zinc-100 py-2.5">
                            <div className="flex items-center gap-2">
                              <Briefcase className="w-4 h-4 text-indigo-500" />
                              <span className="font-bold">{cat.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Section 2: Financials */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-zinc-50/80 dark:bg-zinc-950/40 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
                  <div className="space-y-2">
                    <Label htmlFor="retainer-frequency" className="text-zinc-700 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest">{t('billing_frequency')}</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger id="retainer-frequency" className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 h-11 font-bold text-xs shadow-sm focus:ring-indigo-500/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        <SelectItem value="MONTHLY" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">Quarterly</SelectItem>
                        <SelectItem value="ANNUALLY" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retainer-date" className="text-zinc-700 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest">{t('first_invoice_date')}</Label>
                    <Input
                      id="retainer-date"
                      type="date"
                      value={nextBillingDate}
                      onChange={e => setNextBillingDate(e.target.value)}
                      required
                      className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 h-11 dark:[color-scheme:dark] font-bold shadow-sm focus-visible:ring-indigo-500/30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retainer-amount" className="text-zinc-700 dark:text-zinc-400 font-bold text-xs uppercase tracking-widest">{t('recurring_amount')}</Label>
                    <div className="relative group/amount border-zinc-200 dark:border-zinc-700">
                      <span className="absolute left-3.5 top-3.5 text-zinc-400 dark:text-zinc-500 group-focus-within/amount:text-zinc-900 dark:group-focus-within/amount:text-zinc-100 font-bold transition-colors">{currencySymbol}</span>
                      <Input
                        id="retainer-amount"
                        type="number"
                        min="1"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        required
                        className="pl-9 bg-white dark:bg-zinc-950 border-inherit h-11 font-bold text-indigo-700 dark:text-indigo-400 shadow-sm focus-visible:ring-indigo-500/30 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: THE MAGIC TOGGLE */}
                <div className={`p-6 rounded-xl border-2 transition-all duration-300 ${autoAppendMonth ? 'border-purple-300 dark:border-purple-500/50 bg-gradient-to-br from-purple-50/50 to-transparent dark:from-purple-900/10 dark:to-transparent bg-white dark:bg-zinc-950/80' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 mr-4">
                      <Label htmlFor="smart-naming" className="text-sm font-extrabold uppercase tracking-wider text-zinc-900 dark:text-zinc-50 flex items-center gap-2 cursor-pointer">
                        <Sparkles className={`w-4 h-4 transition-colors ${autoAppendMonth ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400 dark:text-zinc-600'}`} />
                        {t('smart_naming')}
                      </Label>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {t('smart_naming_desc')}
                      </p>
                    </div>
                    <Switch
                      id="smart-naming"
                      aria-label="Toggle Smart Line-Item Naming"
                      checked={autoAppendMonth}
                      onCheckedChange={setAutoAppendMonth}
                      className="data-[state=checked]:bg-purple-600 dark:data-[state=checked]:bg-purple-500 shadow-inner mt-1 shrink-0"
                    />
                  </div>

                  {/* Dynamic Preview */}
                  <div className="mt-5 pt-5 border-t border-purple-200/50 dark:border-purple-500/20">
                    <p className="text-xs font-bold text-purple-800 dark:text-purple-400/80 uppercase tracking-widest mb-2.5">{t('invoice_preview')}</p>
                    <div className="bg-white dark:bg-zinc-950 p-3.5 rounded-lg border border-purple-100 dark:border-purple-900/30 font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 shadow-sm flex items-center gap-2.5 backdrop-blur-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 drop-shadow-sm" />
                      {selectedService ? selectedService.name : t('select_service_ph')}
                      {autoAppendMonth && <span className="text-purple-600 dark:text-purple-400 font-extrabold ml-1.5 opacity-90">({format(new Date(nextBillingDate), 'MMMM yyyy')})</span>}
                    </div>
                  </div>
                </div>

              </CardContent>
              <CardFooter className="bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 p-6 rounded-b-xl flex justify-end">
                <Button type="submit" size="lg" className="w-full md:w-auto md:px-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-widest text-xs h-12 shadow-sm shadow-indigo-500/20 transition-all active:scale-95 border-none" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('configuring')}</span>
                  ) : (
                    <span className="flex items-center gap-2"><Repeat className="w-4 h-4" /> {t('activate')}</span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // --- RENDER LIST VIEW ---
  const activeCount = retainers.filter(r => r.status === 'ACTIVE').length;
  const mrrPipeline = retainers.filter(r => r.status === 'ACTIVE').reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">

        {/* Header & Metrics */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 max-w-7xl mx-auto w-full">
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                  <Repeat className="w-6 h-6 text-indigo-700 dark:text-indigo-400" />
                </div>
                {t('title')}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">{t('description')}</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 px-5 py-2.5 rounded-xl shadow-sm text-center sm:text-right backdrop-blur-sm">
                <p className="text-xs uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-widest">{t('active_pipeline')}</p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{fCurrency(mrrPipeline)}</p>
              </div>
              <Button
                onClick={() => setView('wizard')}
                className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 h-12 px-6 shadow-md shadow-zinc-900/10 dark:shadow-none text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                <Plus className="w-4 h-4 mr-2" /> {t('new_retainer')}
              </Button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <Card className="shadow-xl border-zinc-200 dark:border-zinc-800/80 overflow-hidden bg-white dark:bg-zinc-900/95 flex flex-col">
          <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80 py-4 px-6">
            <CardTitle className="text-base font-extrabold uppercase tracking-widest flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
              <Activity className="w-5 h-5 text-indigo-500" /> {t('active_configs', { count: activeCount })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-24 text-zinc-400 dark:text-zinc-500 bg-zinc-50/20 dark:bg-zinc-950/20">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500/50" />
                <span className="text-xs font-bold uppercase tracking-widest animate-pulse">{t('loading')}</span>
              </div>
            ) : retainers.length === 0 ? (
              <div className="p-20 text-center flex flex-col items-center relative overflow-hidden group bg-zinc-50/30 dark:bg-zinc-950/20">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-5 shadow-sm">
                    <Settings2 className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
                  </div>
                  <h3 className="text-lg font-extrabold uppercase tracking-widest text-zinc-900 dark:text-zinc-100 mb-1">
                    {t('no_retainers')}
                  </h3>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm text-sm font-medium leading-relaxed">
                    {t('no_retainers_desc')}
                  </p>
                  <Button
                    onClick={() => setView('wizard')}
                    variant="outline"
                    className="mt-6 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 h-10 px-6"
                  >
                    {t('setup_first')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader className="bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800/80 sticky top-0 z-10 backdrop-blur-sm">
                    <TableRow className="dark:border-zinc-800/80 hover:bg-transparent">
                      <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest px-6 py-4">{t('col_client_service')}</TableHead>
                      <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_amount')}</TableHead>
                      <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_frequency')}</TableHead>
                      <TableHead className="dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_next')}</TableHead>
                      <TableHead className="text-center dark:text-zinc-400 text-xs font-bold uppercase tracking-widest">{t('col_status')}</TableHead>
                      <TableHead className="text-right dark:text-zinc-400 text-xs font-bold uppercase tracking-widest px-6">{t('col_actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retainers.map((ret) => (
                      <TableRow key={ret.id} className={`dark:border-zinc-800/80 transition-all duration-300 ${ret.status === 'PAUSED' ? 'opacity-60 bg-zinc-50/50 dark:bg-zinc-950/30' : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 group'}`}>
                        <TableCell className="px-6 py-4">
                          <div className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100">{ret.client?.name}</div>
                          <div className="text-xs font-bold uppercase tracking-tight text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1">
                            {ret.serviceName}
                            {ret.autoAppendMonth && <span title="Smart Naming Enabled"><Sparkles className="w-3 h-3 text-purple-500 ml-1" /></span>}
                          </div>
                        </TableCell>
                        <TableCell className="font-black text-sm text-indigo-700 dark:text-indigo-400">
                          {fCurrency(ret.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-zinc-600 text-xs dark:text-zinc-300 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 font-bold uppercase tracking-widest shadow-sm py-0.5 px-2">
                            {ret.frequency}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 px-2.5 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50 w-fit">
                            <CalendarClock className="w-3.5 h-3.5 text-indigo-500" />
                            {format(new Date(ret.nextBillingDate), safeDateFormat)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {ret.status === 'ACTIVE' ? (
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 border border-emerald-200/50 dark:border-emerald-800/50 text-xs font-bold uppercase tracking-widest shadow-none px-2 py-0.5">
                              <PlayCircle className="w-3 h-3 mr-1.5" /> {t('status_running')}
                            </Badge>
                          ) : (
                            <Badge className="bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 border border-zinc-200/50 dark:border-zinc-700/50 text-xs font-bold uppercase tracking-widest shadow-none px-2 py-0.5">
                              <PauseCircle className="w-3 h-3 mr-1.5" /> {t('status_paused')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={ret.status === 'ACTIVE' ? `Pause retainer for ${ret.client?.name}` : `Resume retainer for ${ret.client?.name}`}
                              onClick={() => handleToggleStatus(ret.id, ret.status)}
                              className={ret.status === 'ACTIVE'
                                ? 'text-amber-600 hover:text-amber-700 bg-white hover:bg-amber-50 border border-zinc-100 hover:border-amber-200 dark:border-zinc-800/50 dark:bg-zinc-900 dark:text-amber-500 dark:hover:text-amber-400 dark:hover:bg-amber-500/10 dark:hover:border-amber-800/50 w-8 px-0 transition-all shadow-sm'
                                : 'text-emerald-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 border border-zinc-100 hover:border-emerald-200 dark:border-zinc-800/50 dark:bg-zinc-900 dark:text-emerald-500 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 dark:hover:border-emerald-800/50 w-8 px-0 transition-all shadow-sm'}
                            >
                              {ret.status === 'ACTIVE' ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                            </Button>

                            {/* EDIT ACTION BUTTON */}
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit retainer details for ${ret.client?.name}`}
                              onClick={() => openEditModal(ret)}
                              className="text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-zinc-100 hover:border-blue-200 dark:border-zinc-800/50 dark:bg-zinc-900 dark:text-blue-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 dark:hover:border-blue-800/50 w-8 px-0 transition-all shadow-sm"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>

                            {/* DESTRUCTIVE ACTION BUTTON */}
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete retainer for ${ret.client?.name}`}
                              onClick={() => setRetainerToDelete(ret.id)}
                              className="text-rose-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-zinc-100 hover:border-rose-200 dark:border-zinc-800/50 dark:bg-zinc-900 dark:text-rose-500 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 dark:hover:border-rose-800/50 w-8 px-0 transition-all shadow-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* EDIT RETAINER MODAL */}
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-zinc-950/95 dark:backdrop-blur-xl">
            <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/80">
              <DialogHeader>
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-blue-600/10 dark:bg-blue-500/20 rounded-xl border border-blue-200/50 dark:border-blue-400/20">
                    <Pencil className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {t('edit_loop')}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs font-medium">
                      {t('edit_desc', { clientName: retainerToEdit?.client?.name ?? '' })}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="space-y-5 p-6 bg-white dark:bg-zinc-950">
                <div className="space-y-2">
                  <Label htmlFor="edit-service" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('service_name_label')}</Label>
                  <Input
                    id="edit-service"
                    value={editServiceName}
                    onChange={(e) => setEditServiceName(e.target.value)}
                    required
                    className="h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 font-bold shadow-sm focus-visible:ring-indigo-500/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="edit-amount" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('amount_label', { currency })}</Label>
                    <div className="relative border-zinc-200 dark:border-zinc-800 group/amount2">
                      <span className="absolute left-3.5 top-[11px] text-zinc-400 group-focus-within/amount2:text-zinc-900 dark:group-focus-within/amount2:text-zinc-100 font-bold text-xs transition-colors">{currencySymbol}</span>
                      <Input
                        id="edit-amount"
                        type="number"
                        min="1"
                        className="pl-9 h-10 font-bold text-indigo-700 dark:text-indigo-400 bg-zinc-50 dark:bg-zinc-900 border-inherit shadow-sm focus-visible:ring-indigo-500/30 transition-colors"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-frequency" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('frequency_label')}</Label>
                    <Select value={editFrequency} onValueChange={setEditFrequency}>
                      <SelectTrigger id="edit-frequency" className="h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 dark:text-zinc-100 font-bold text-xs shadow-sm focus:ring-indigo-500/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        <SelectItem value="MONTHLY" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">Quarterly</SelectItem>
                        <SelectItem value="ANNUALLY" className="dark:focus:bg-zinc-800 dark:text-zinc-100 text-xs font-bold uppercase tracking-wider py-2">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3 rounded-b-lg">
                <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)} className="mt-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</Button>
                <Button type="submit" disabled={isEditing} className="bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-indigo-500/20 transition-all active:scale-95 border-none">
                  {isEditing ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}</span>
                  ) : t('save_changes')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* DESTRUCTIVE ACTION ALERT DIALOG */}
        <AlertDialog open={!!retainerToDelete} onOpenChange={() => setRetainerToDelete(null)}>
          <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800 sm:max-w-md p-0 overflow-hidden">
            <div className="p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-zinc-900 dark:text-zinc-50 font-bold tracking-tight text-lg">
                  {t('destroy_title')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mt-2 leading-relaxed">
                  {t('destroy_desc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
            <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
              <AlertDialogCancel className="mt-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteRetainer} className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-500 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-rose-500/20 transition-all active:scale-95 border-none">
                {t('yes_destroy')}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
        <TaxRateModal
          open={taxRateModalOpen}
          onOpenChange={setTaxRateModalOpen}
          taxLabel={taxRateMeta.taxLabel}
          countryCode={taxRateMeta.countryCode}
          candidates={taxRateMeta.candidates}
          value={taxRateInput}
          onValueChange={setTaxRateInput}
          onConfirm={handleTaxRateConfirm}
          isSubmitting={isSubmitting}
          title="Set tax rate for this retainer"
          description="We could not infer a tax rate from country + service code. Add it once and we will remember it for future billing."
        />

      </div>
    </div>
  );
}

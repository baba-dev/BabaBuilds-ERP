"use client";

import Link from "next/link";

import { useState, useEffect, useMemo } from "react";
import { format, addMonths } from "date-fns";
import { Repeat, Plus, ArrowLeft, Sparkles, CalendarClock, PlayCircle, PauseCircle, Activity, Trash2, Pencil, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { TaxRateModal } from "@/components/invoice/tax-rate-modal";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import RetainerBuilder from "@/components/retainers/RetainerBuilder";

interface Retainer {
  id: string;
  clientId: string;
  serviceName: string;
  amount: number;
  frequency: string;
  autoAppendMonth: boolean;
  nextBillingDate: string;
  status: string;
  sourceProposalId?: string;
  client?: {
    name: string;
    email: string;
  };
}

interface Client {
  id: string;
  name: string;
  email: string;
  isExport?: boolean;
}

interface CatalogItem {
  id: string;
  name: string;
  defaultPrice: number;
}


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
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  // Wizard Form States
  const [clientId, setClientId] = useState("");
  const [serviceTemplateId, setServiceTemplateId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency] = useState("MONTHLY");
  const [autoAppendMonth, setAutoAppendMonth] = useState(true);

  // Deletion State
  const [retainerToDelete, setRetainerToDelete] = useState<string | null>(null);

  // Edit State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [retainerToEdit, setRetainerToEdit] = useState<Retainer | null>(null);
  const [editServiceName, setEditServiceName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editFrequency, setEditFrequency] = useState("MONTHLY");
  const [isEditing, setIsEditing] = useState(false);
  const [taxRateModalOpen, setTaxRateModalOpen] = useState(false);
  const [taxRateInput, setTaxRateInput] = useState("");
  const [taxRateMeta] = useState<{ taxLabel?: string; countryCode?: string; candidates?: number[] }>({});

  // Default to the 1st of the *next* month
  const [nextBillingDate] = useState(() => {
    const nextMonth = addMonths(new Date(), 1);
    return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1), 'yyyy-MM-dd');
  });

  useEffect(() => {
    fetchData();
  }, [view]);

  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (!aiPayload) return;

    try {
      const { path, data, timestamp } = JSON.parse(aiPayload);
      const isFresh = (Date.now() - timestamp) < 10000;
      if (!isFresh || !data || path !== '/retainers') {
        sessionStorage.removeItem('erp_ai_payload');
        return;
      }

      const needsServiceLookup = !data.serviceTemplateId && !!data.serviceName;
      const needsClientLookup = !!data.client;
      const lookupReady =
        (!needsServiceLookup || catalog.length > 0) &&
        (!needsClientLookup || clients.length > 0);

      // Defer payload consumption until required lookup datasets are loaded.
      if (!lookupReady) return;

      if (data.amount) setAmount(data.amount.toString());
      if (data.serviceTemplateId) setServiceTemplateId(data.serviceTemplateId.toString());
      if (needsServiceLookup) {
        const matchedService = catalog.find(s => s.name.toLowerCase().includes(data.serviceName.toLowerCase()));
        if (matchedService) setServiceTemplateId(matchedService.id.toString());
      }

      if (needsClientLookup) {
        const matchedClient = clients.find(c => c.name.toLowerCase().includes(data.client.toLowerCase()));
        if (matchedClient) setClientId(matchedClient.id.toString());
      }
      setView('wizard');
      sessionStorage.removeItem('erp_ai_payload');
    } catch {
      console.error("Failed to parse AI payload");
      sessionStorage.removeItem('erp_ai_payload');
    }
  }, [clients, catalog]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (view === 'list') {
        const res = await fetch('/api/retainers');
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((payload as any)?.error || "Failed to load retainers");
        }
        setRetainers(Array.isArray(payload) ? payload : []);
      } else {
        const [clientRes, catRes] = await Promise.all([
          fetch('/api/clients?limit=100'),
          fetch('/api/services?limit=100')
        ]);
        const clientData = await clientRes.json().catch(() => null);
        const catData = await catRes.json().catch(() => null);
        if (!clientRes.ok) throw new Error((clientData as any)?.error || "Failed to load clients");
        if (!catRes.ok) throw new Error((catData as any)?.error || "Failed to load services");
        const parsedClients = Array.isArray(clientData) ? clientData : (clientData as any)?.data;
        const parsedCatalog = Array.isArray(catData) ? catData : (catData as any)?.data;
        setClients(Array.isArray(parsedClients) ? parsedClients : []);
        setCatalog(Array.isArray(parsedCatalog) ? parsedCatalog : []);
      }
    } catch (err: unknown) {
      console.error("Failed to load retainer data", err);
      toast.error(err instanceof Error ? err.message : "Failed to load retainer configurations. Please refresh.");
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
    } catch {
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
    } catch {
      setRetainers(previousRetainers);
      toast.error("Failed to delete retainer.", { id: toastId });
    }
  };

  const openEditModal = (ret: Retainer) => {
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
    } catch {
      setRetainers(previousRetainers);
      toast.error("Failed to update retainer.", { id: toastId });
    } finally {
      setIsEditing(false);
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

  const renderListHeaderActions = () => (
    <Button
      onClick={() => setView('wizard')}
      className="btn-primary w-full sm:w-auto shrink-0 text-xs uppercase tracking-wider h-12 px-6"
    >
      <Plus className="w-4 h-4 mr-2" /> {t('new_retainer')}
    </Button>
  );

  const renderBuilderHeaderActions = () => (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setView('list')}
      aria-label="Back to Retainers List"
      className="rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 active:scale-95 transition-transform"
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  );

  const renderKpiCardForView = (currentView: 'list' | 'wizard') => {
    if (currentView !== 'list') return null;

    return (
      <div className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 px-5 py-2.5 rounded-xl shadow-sm text-center sm:text-right backdrop-blur-sm">
        <p className="text-xs uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-widest">{t('active_pipeline')}</p>
        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{fCurrency(mrrPipeline)}</p>
      </div>
    );
  };

  

  // --- RENDER LIST VIEW ---
  const activeCount = retainers.filter(r => r.status === 'ACTIVE').length;
  const mrrPipeline = retainers.filter(r => r.status === 'ACTIVE').reduce((sum, r) => {
    const amountValue = Number(r.amount ?? 0);
    return sum + (Number.isFinite(amountValue) ? amountValue : 0);
  }, 0);
  const retainerColumns: DataTableColumnDef<Retainer>[] = [
    {
      id: "client_service",
      header: t('col_client_service'),
      accessor: (ret) => `${ret.client?.name ?? ""} ${ret.serviceName ?? ""}`,
      className: "px-6 py-4",
      cell: (ret) => (
        <>
          <div className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100">{ret.client?.name}</div>
          <div className="text-xs font-bold uppercase tracking-tight text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1">
            {ret.serviceName}
            {ret.autoAppendMonth && <span title="Smart Naming Enabled"><Sparkles className="w-3 h-3 text-purple-500 ml-1" /></span>}
          </div>
          {ret.sourceProposalId && (
            <Link href={`/proposals/${ret.sourceProposalId}`} className="mt-1 flex items-center text-[10px] uppercase font-bold tracking-widest text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              <Sparkles className="w-3 h-3 mr-1" /> Origin
            </Link>
          )}
        </>
      ),
    },
    {
      id: "amount",
      header: t('col_amount'),
      sortable: true,
      sortAccessor: (ret) => ret.amount,
      className: "font-black text-sm text-indigo-700 dark:text-indigo-400",
      cell: (ret) => fCurrency(ret.amount),
    },
    {
      id: "frequency",
      header: t('col_frequency'),
      accessor: (ret) => ret.frequency,
      cell: (ret) => (
        <Badge variant="outline" className="text-zinc-600 text-xs dark:text-zinc-300 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 font-bold uppercase tracking-widest shadow-sm py-0.5 px-2">
          {ret.frequency}
        </Badge>
      ),
    },
    {
      id: "next_billing",
      header: t('col_next'),
      sortable: true,
      sortAccessor: (ret) => new Date(ret.nextBillingDate).getTime(),
      cell: (ret) => (
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 px-2.5 py-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800/50 w-fit">
          <CalendarClock className="w-3.5 h-3.5 text-indigo-500" />
          {format(new Date(ret.nextBillingDate), safeDateFormat)}
        </div>
      ),
    },
    {
      id: "status",
      header: <div className="text-center">{t('col_status')}</div>,
      accessor: (ret) => ret.status,
      className: "text-center",
      cell: (ret) => ret.status === 'ACTIVE' ? (
        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 border border-emerald-200/50 dark:border-emerald-800/50 text-xs font-bold uppercase tracking-widest shadow-none px-2 py-0.5">
          <PlayCircle className="w-3 h-3 mr-1.5" /> {t('status_running')}
        </Badge>
      ) : (
        <Badge className="bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 border border-zinc-200/50 dark:border-zinc-700/50 text-xs font-bold uppercase tracking-widest shadow-none px-2 py-0.5">
          <PauseCircle className="w-3 h-3 mr-1.5" /> {t('status_paused')}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: <div className="text-right px-6">{t('col_actions')}</div>,
      className: "text-right px-6",
      cell: (ret) => (
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
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit retainer details for ${ret.client?.name}`}
            onClick={() => openEditModal(ret)}
            className="text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-zinc-100 hover:border-blue-200 dark:border-zinc-800/50 dark:bg-zinc-900 dark:text-blue-500 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 dark:hover:border-blue-800/50 w-8 px-0 transition-all shadow-sm"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
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
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 pb-20 transition-colors duration-300">
      <div className={`${view === 'list' ? 'max-w-7xl' : 'max-w-3xl'} mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out`}>

        {/* Header & Metrics */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 max-w-7xl mx-auto w-full">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                  <Repeat className="w-6 h-6 text-indigo-700 dark:text-indigo-400" />
                </div>
                {view === 'list' ? t('title') : t('configure')}
              </h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">
                {view === 'list' ? t('description') : t('configure_desc')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {renderKpiCardForView(view)}
              {view === 'list' ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        {renderListHeaderActions()}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-relaxed">
                      Start a recurring billing loop for one client-service pair. The first invoice date sets the cadence for all future cycles.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                renderBuilderHeaderActions()
              )}
            </div>
          </div>
        </div>

        {view === 'list' ? (
        <Card className="shadow-xl border-zinc-200 dark:border-zinc-800/80 overflow-hidden bg-white dark:bg-zinc-900/95 flex flex-col">
          <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80 py-4 px-6">
            <CardTitle className="text-base font-extrabold uppercase tracking-widest flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
              <Activity className="w-5 h-5 text-indigo-500" /> {t('active_configs', { count: activeCount })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={retainerColumns}
              data={retainers}
              rowId={(row) => row.id}
              loading={isLoading}
              emptyTitle={t('no_retainers')}
              emptyDescription={t('no_retainers_desc')}
            />
          </CardContent>
        </Card>
        ) : (
          <RetainerBuilder 
            clients={clients} 
            catalog={catalog} 
            onSuccess={() => { setView('list'); fetchData(); }} 
            onCancel={() => setView('list')} 
            defaultClient={clientId} 
            defaultService={serviceTemplateId} 
          />
        )}

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

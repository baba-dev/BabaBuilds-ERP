"use client";

import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { FileText, Plus, Trash2, ArrowLeft, Send, Copy, CheckCircle2, Building2, Briefcase, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";

export default function ProposalsEngine() {
  const t = useTranslations('Proposals');
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [proposals, setProposals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);

  // --- GLOBALIZATION ENGINE ---
  const { 
    fCurrency, 
    currency, 
    locale, 
    dateFormat = "dd/MM/yyyy", 
    taxLabel = "Tax", 
    countryCode = "Global" 
  } = useFormat();
  
  const currencySymbol = getCurrencySymbol(currency, locale);

  // Builder State
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [validUntil, setValidUntil] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd')); 
  const [items, setItems] = useState<{serviceTemplateId: string, title: string, description: string, quantity: number, unitPrice: number}[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  
  // Deletion State
  const [proposalToDelete, setProposalToDelete] = useState<string | null>(null);

  // Conversion Modal State
  const [proposalToConvert, setProposalToConvert] = useState<any | null>(null);
  const [conversionMonth, setConversionMonth] = useState("");
  const [conversionDate, setConversionDate] = useState("");

  useEffect(() => {
    fetchData();
  }, [view]);

  const fetchData = async () => {
    try {
      if (view === 'list') {
        const [propRes, clientRes] = await Promise.all([
          fetch('/api/proposals'),
          fetch('/api/clients')
        ]);
        if (!propRes.ok) throw new Error(`Proposals API failed with status: ${propRes.status}`);
        const propData = await propRes.json();
        setProposals(Array.isArray(propData) ? propData : []);
        // Always load clients so the AI payload consumer can fuzzy-match on initial load
        const clientData = await clientRes.json();
        setClients(clientData.data && Array.isArray(clientData.data) ? clientData.data : []);
      } else {
        const clientRes = await fetch('/api/clients');
        if (!clientRes.ok) throw new Error(`Clients API failed with status: ${clientRes.status}`);
        const clientData = await clientRes.json();
        setClients(clientData.data && Array.isArray(clientData.data) ? clientData.data : []);

        const catRes = await fetch('/api/services');
        if (!catRes.ok) throw new Error(`Services API failed with status: ${catRes.status}`);
        const catData = await catRes.json();
        setCatalog(Array.isArray(catData) ? catData : []);
        
        if (items.length === 0) handleAddItem();
      }
    } catch (err: any) {
      console.error("🚨 Detailed Fetch Error:", err.message || err);
      toast.error(`Data load failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Bug 7 Fix: SMART AI AUTO-FILL for Proposals ---
  // The AI's draft_proposal tool stores a payload in sessionStorage then navigates here.
  // This effect reads it, switches to the builder, and pre-fills the form.
  useEffect(() => {
    if (clients.length === 0) return;

    const raw = sessionStorage.getItem('erp_ai_payload');
    if (!raw) return;

    try {
      const { path, data, timestamp } = JSON.parse(raw);
      const isFresh = (Date.now() - timestamp) < 10000;

      if (isFresh && data && path === '/proposals') {
        setView('builder');
        if (data.title) setTitle(data.title);
        if (data.clientName) {
          const matched = clients.find((c: any) =>
            c.name.toLowerCase().includes(data.clientName.toLowerCase())
          );
          if (matched) setClientId(matched.id);
        }
      }
      sessionStorage.removeItem('erp_ai_payload');
    } catch (e) {
      console.error("Failed to parse AI payload for Proposals:", e);
      sessionStorage.removeItem('erp_ai_payload');
    }
  }, [clients]);

  // --- OPTIMISTIC DELETE LOGIC ---
  const confirmDelete = async () => {
    if (!proposalToDelete) return;
    const id = proposalToDelete;
    setProposalToDelete(null); 

    const toastId = toast.loading("Deleting proposal...");
    
    const previousProposals = [...proposals];
    setProposals(proposals.filter(p => p.id !== id));

    try {
      const res = await fetch(`/api/proposals/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Proposal permanently removed", { id: toastId });
    } catch (err) {
      setProposals(previousProposals); 
      toast.error("An error occurred while deleting.", { id: toastId });
    }
  };

  // --- BUILDER LOGIC ---
  const handleAddItem = () => {
    setItems([...items, { serviceTemplateId: "", title: "", description: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const handleCatalogSelect = (index: number, templateId: string) => {
    const template = catalog.find(c => c.id === templateId);
    if (!template) return;
    
    const newItems = [...items];
    const currentItem = newItems[index];

    newItems[index] = {
      ...currentItem,
      serviceTemplateId: template.id,
      title: currentItem.title || template.name,
      description: currentItem.description || template.description || "",
      unitPrice: currentItem.unitPrice || template.defaultPrice
    };
    setItems(newItems);
  };

  const selectedClient = clients.find(c => c.id === clientId);
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  
  // Generalized Tax Logic based on country
  const taxRate = countryCode === "IN" ? 0.18 : 0; // Default to 18% for India, 0% elsewhere as a fallback until API provides slabs
  const estimatedTax = selectedClient?.isExport ? 0 : subtotal * taxRate; 
  const grandTotal = subtotal + estimatedTax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || subtotal === 0) {
      toast.error("Please add at least one valid item.");
      return;
    }
    
    setIsSubmitting(true);
    const toastId = toast.loading("Saving proposal...");

    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, title, validUntil, items })
      });
      
      if (res.ok) {
        toast.success("Proposal created successfully!", { id: toastId });
        setView('list');
        setTitle(""); setClientId(""); setItems([]);
      } else {
        toast.error("Failed to save proposal.", { id: toastId });
      }
    } catch (err) {
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- SMART CONVERSION LOGIC ---
  const openConversionModal = (prop: any) => {
    setProposalToConvert(prop);
    setConversionMonth(format(new Date(), "MMMM yyyy")); 
    setConversionDate(format(new Date(), 'yyyy-MM-dd'));
  };

    const confirmConversion = async () => {
    if (!proposalToConvert) return;
    
    // --- 🚨 STRICT UI LOCK: Prevent double-execution ---
    if (convertingId) return; 
    
    const prop = proposalToConvert;
    
    // Immediately clear the modal state so it disappears
    setProposalToConvert(null); 
    
    // Lock the specific proposal ID so the button in the list view disables
    setConvertingId(prop.id);
    const toastId = toast.loading("Generating official Tax Invoice...");

    try {
      const generateRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: prop.clientId,
          billingMonth: conversionMonth, 
          sacCode: "As per Proposal", 
          services: prop.items.map((item: any) => ({
            title: `${item.title} ${item.quantity > 1 ? `(Qty: ${item.quantity})` : ''}`,
            nicDetails: item.description || "Agreed Deliverable",
            amount: item.quantity * item.unitPrice 
          })),
          customDate: new Date(conversionDate).toISOString(), 
          sendEmail: false 
        })
      });

      const generateData = await generateRes.json();
      if (!generateRes.ok) throw new Error(generateData.error || "Invoice generation failed.");
      
      await fetch(`/api/proposals/${prop.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INVOICED' })
      });
      
      // --- AUTO-RETAINER PIPELINE ---
      const recurringItems = prop.items.filter((item: any) => 
        item.title.toLowerCase().includes('monthly') || 
        item.title.toLowerCase().includes('retainer') ||
        item.title.toLowerCase().includes('subscription') ||
        (item.description && item.description.toLowerCase().includes('monthly')) ||
        (item.description && item.description.toLowerCase().includes('retainer'))
      );

      if (recurringItems.length > 0) {
        const retainerAmount = recurringItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
        const retainerServiceName = recurringItems.map((i: any) => i.title).join(' + ');
        
        const nextDate = new Date(conversionDate);
        nextDate.setMonth(nextDate.getMonth() + 1);

        const retainerRes = await fetch('/api/retainers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: prop.clientId,
            serviceName: retainerServiceName,
            amount: retainerAmount,
            frequency: "MONTHLY",
            autoAppendMonth: true,
            nextBillingDate: nextDate.toISOString()
          })
        });

        if (retainerRes.ok) {
          toast.success(`Invoice ${generateData.invoice.invoiceNumber} created & Auto-Retainer Activated!`, { id: toastId });
        } else {
          toast.success(`Invoice generated, but failed to start Retainer automatically.`, { id: toastId });
        }
      } else {
        toast.success(`Success! Invoice ${generateData.invoice.invoiceNumber} has been generated.`, { id: toastId });
      }

      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to convert to invoice.", { id: toastId });
    } finally {
      // Release the lock
      setConvertingId(null);
    }
  };

  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, 'd').replace(/Y/g, 'y');

  // --- RENDER VIEWS ---
  if (view === 'builder') {
    return (
      <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 pb-20 transition-colors duration-300">
        <div className="sticky top-0 z-50 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl border-b border-zinc-200/50 dark:border-zinc-800/50 px-4 md:px-8 py-4 flex items-center justify-between shadow-sm transition-all duration-300">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setView('list')} aria-label="Back to Proposals List" className="rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 active:scale-95 transition-transform">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{t('draft_new')}</h1>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('unsaved_draft')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block mr-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-widest font-bold">{t('est_total')}</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{fCurrency(grandTotal)}</p>
            </div>
            <Button onClick={handleSubmit} disabled={isSubmitting || !clientId} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 text-xs font-bold uppercase tracking-widest h-10 transition-all active:scale-95 border-none">
              {isSubmitting ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('generating')}</span>
              ) : (
                <span className="flex items-center gap-2"><Send className="w-4 h-4" /> {t('finalize_save')}</span>
              )}
            </Button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4 md:p-8 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          <Card className="shadow-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 w-full" />
            <form onSubmit={handleSubmit}>
              <CardContent className="p-6 md:p-8 space-y-10">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-5 p-5 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                    <div className="space-y-1.5">
                      <Label htmlFor="proposal-title" className="text-zinc-500 dark:text-zinc-400 font-bold uppercase text-xs tracking-widest">{t('proposal_title')}</Label>
                      <Input 
                        id="proposal-title"
                        placeholder={t('ph_title')} 
                        className="text-lg font-bold border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-zinc-50 h-12 shadow-sm transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500" 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="proposal-client" className="text-zinc-500 dark:text-zinc-400 font-bold uppercase text-xs tracking-widest">{t('prepared_for')}</Label>
                      <Select value={clientId} onValueChange={setClientId}>
                        <SelectTrigger id="proposal-client" className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-zinc-50 h-12 font-bold shadow-sm transition-all focus:ring-indigo-500/30 focus:border-indigo-500">
                          <SelectValue placeholder={t('select_client')} />
                        </SelectTrigger>
                        <SelectContent position="popper" className="dark:bg-zinc-900 dark:border-zinc-800">
                          {clients.map(c => (
                            <SelectItem key={c.id} value={c.id} className="dark:focus:bg-zinc-800 py-2.5">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-zinc-400" />
                                <span className="dark:text-zinc-100 font-bold">{c.name}</span>
                                {c.isExport && <Badge className="text-xs uppercase tracking-widest ml-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 shadow-none border border-indigo-200/50 dark:border-indigo-800/50 px-1.5">{t('export')}</Badge>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-5 p-5 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                    <div className="space-y-1.5">
                      <Label htmlFor="valid-until" className="text-zinc-500 dark:text-zinc-400 font-bold uppercase text-xs tracking-widest">{t('valid_until')}</Label>
                      <Input 
                        id="valid-until"
                        type="date" 
                        className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 dark:text-zinc-50 h-12 dark:[color-scheme:dark] font-bold shadow-sm transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500" 
                        value={validUntil} 
                        onChange={e => setValidUntil(e.target.value)} 
                        required 
                      />
                    </div>
                    {selectedClient && (
                      <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                        <p className="text-xs font-bold uppercase tracking-widest text-indigo-900 dark:text-indigo-300 mb-1.5">{t('tax_treatment')}</p>
                        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> 
                          {selectedClient.isExport ? t('export_billing', { taxLabel }) : t('domestic_billing', { rate: taxRate * 100, taxLabel })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800/80 pb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" /> {t('scope_of_work')}
                  </h3>
                  
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div key={index} className="flex flex-col md:flex-row gap-4 p-5 bg-zinc-50/80 dark:bg-zinc-950/40 rounded-xl border border-zinc-200 dark:border-zinc-800/80 relative group transition-all hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800/60">
                        <button type="button" onClick={() => handleRemoveItem(index)} aria-label="Remove line item" className="absolute -top-3 -right-3 bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/60 text-rose-500 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-rose-50 dark:hover:bg-rose-950 hover:scale-105 shadow-sm z-10 focus:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex flex-col xl:flex-row gap-3">
                            <div className="w-full xl:w-1/3 shrink-0">
                              <Select onValueChange={(val) => handleCatalogSelect(index, val)}>
                                <SelectTrigger aria-label={`Select catalog template for item ${index+1}`} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 dark:text-zinc-100 font-bold text-xs h-10 shadow-sm focus:ring-indigo-500/30">
                                  <SelectValue placeholder={t('pull_catalog')} />
                                </SelectTrigger>
                                <SelectContent position="popper" className="dark:bg-zinc-900 dark:border-zinc-800">
                                  {catalog.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id} className="dark:focus:bg-zinc-800">
                                      <div className="flex items-center gap-2 dark:text-zinc-100 font-bold text-xs">
                                        <Briefcase className="w-3.5 h-3.5 text-indigo-500" /> {cat.name}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1 min-w-0">
                              <Label htmlFor={`item-title-${index}`} className="sr-only">Line Item Title</Label>
                              <Input 
                                id={`item-title-${index}`}
                                placeholder={t('service_title')} 
                                value={item.title} 
                                onChange={e => updateItem(index, 'title', e.target.value)} 
                                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 font-bold text-sm dark:text-zinc-50 h-10 shadow-sm focus-visible:ring-indigo-500/30" 
                                required 
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor={`item-desc-${index}`} className="sr-only">Line Item Description</Label>
                            <Input 
                              id={`item-desc-${index}`}
                              placeholder={t('desc_deliverables')} 
                              value={item.description} 
                              onChange={e => updateItem(index, 'description', e.target.value)} 
                              className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-xs font-medium dark:text-zinc-300 shadow-sm focus-visible:ring-indigo-500/30 h-10" 
                            />
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col lg:flex-row gap-3 md:w-48 lg:w-64 shrink-0">
                          <div className="w-20 md:w-full lg:w-20 space-y-1.5 shrink-0">
                            <Label htmlFor={`item-qty-${index}`} className="text-xs uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">{t('qty')}</Label>
                            <Input 
                              id={`item-qty-${index}`}
                              type="number" 
                              min="1" 
                              value={item.quantity} 
                              onChange={e => updateItem(index, 'quantity', Number(e.target.value))} 
                              className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-center dark:text-zinc-50 font-bold h-10 shadow-sm focus-visible:ring-indigo-500/30" 
                              required 
                            />
                          </div>
                          <div className="flex-1 space-y-1.5 min-w-0">
                            <Label htmlFor={`item-rate-${index}`} className="text-xs uppercase font-bold tracking-widest text-zinc-500 dark:text-zinc-400 ml-1">{t('rate')}</Label>
                            <div className="relative group/rate border-zinc-200 dark:border-zinc-700">
                              <span className="absolute left-3.5 top-[11px] text-zinc-400 group-focus-within/rate:text-zinc-900 dark:group-focus-within/rate:text-zinc-100 text-xs font-bold transition-colors">{currencySymbol}</span>
                              <Input 
                                id={`item-rate-${index}`}
                                type="number" 
                                min="0" 
                                value={item.unitPrice} 
                                onChange={e => updateItem(index, 'unitPrice', Number(e.target.value))} 
                                className="pl-9 bg-white dark:bg-zinc-900 border-inherit dark:text-zinc-50 font-bold text-sm h-10 shadow-sm focus-visible:ring-indigo-500/30 transition-colors" 
                                required 
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button type="button" variant="outline" onClick={handleAddItem} className="w-full border-dashed border-2 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 border-zinc-200 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 bg-zinc-50/50 dark:bg-zinc-900/30 dark:border-zinc-800 text-xs font-bold uppercase tracking-widest mt-4 h-12 transition-all active:scale-[0.99]">
                    <Plus className="w-4 h-4 mr-2" /> {t('add_item')}
                  </Button>
                </div>

                <div className="flex justify-end pt-8 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div className="w-full md:w-80 space-y-3.5 bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">
                      <span>{t('subtotal')}</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{fCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400 text-xs font-bold uppercase tracking-wider">
                      <span>{t('est_tax', { taxLabel, isExport: selectedClient?.isExport ? '(Export 0%)' : '' })}</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{fCurrency(estimatedTax)}</span>
                    </div>
                    <div className="flex justify-between items-center text-zinc-900 dark:text-zinc-50 font-black text-2xl pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs self-center uppercase tracking-widest font-extrabold text-zinc-500 dark:text-zinc-400">{t('total')}</span>
                      <span className="text-indigo-600 dark:text-indigo-400 drop-shadow-sm">{fCurrency(grandTotal)}</span>
                    </div>
                  </div>
                </div>

              </CardContent>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 max-w-7xl mx-auto w-full">
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t('title')}</h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm max-w-xl">
                {t('description')}
              </p>
            </div>
            <Button 
              onClick={() => setView('builder')} 
              className="w-full md:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 text-xs font-bold uppercase tracking-wider h-11 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 md:mr-2" /> <span className="md:inline">{t('create_proposal')}</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/20 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500/50" />
            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">{t('loading_proposals')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {proposals.map((prop) => (
              <Card key={prop.id} className="group relative hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col">
                
                {/* DESTRUCTIVE ACTION: Delete Proposal */}
                <button 
                  onClick={() => setProposalToDelete(prop.id)}
                  aria-label={`Delete proposal ${prop.proposalNo}`}
                  className="absolute top-4 right-4 p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hover:bg-rose-600 dark:hover:bg-rose-600 hover:text-white dark:hover:text-white z-10 shadow-sm sm:shadow-none hover:shadow-md active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <CardHeader className="pb-4 pt-5 px-6 border-b border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex justify-between items-start mb-3 pr-8">
                    <Badge variant="outline" className={`text-xs font-bold uppercase tracking-widest border shadow-none px-2 py-0.5 ${
                      prop.status === 'ACCEPTED' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' : 
                      prop.status === 'INVOICED' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700' : 
                      prop.status === 'DRAFT' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' :
                      'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
                    }`}>
                      {prop.status}
                    </Badge>
                    <span className="text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">{prop.proposalNo}</span>
                  </div>
                  <CardTitle className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 line-clamp-1 pr-8 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {prop.title}
                  </CardTitle>
                  <CardDescription className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {prop.client?.name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col pt-5 px-6 pb-6 bg-zinc-50/50 dark:bg-zinc-950/30">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-bold tracking-widest">Total Value</p>
                      <p className="text-xl font-black text-indigo-700 dark:text-indigo-400 tracking-tight mt-0.5">{fCurrency(prop.totalAmount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase font-bold tracking-widest">Expires</p>
                      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mt-1.5">{format(new Date(prop.validUntil), safeDateFormat)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-auto border-t border-zinc-200 dark:border-zinc-800/80 pt-4">
                    {prop.status === 'ACCEPTED' ? (
                      <Button 
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm shadow-emerald-500/20 text-xs uppercase tracking-wider h-10 transition-all active:scale-95 border-none"
                        onClick={() => openConversionModal(prop)}
                        disabled={convertingId === prop.id}
                      >
                        {convertingId === prop.id ? (
                          <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('generating')}</span>
                        ) : t('convert_invoice')}
                      </Button>
                    ) : prop.status === 'INVOICED' ? (
                      <div className="flex items-center justify-center w-full h-10 bg-zinc-100/80 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-400 rounded-md font-bold text-xs uppercase tracking-wider shadow-sm">
                        <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500 drop-shadow-sm" /> {t('successfully_invoiced')}
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        className="w-full bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 h-10"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/p/${prop.publicToken}`);
                          toast.success("Secure Client Link copied to clipboard!");
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" /> {t('copy_link')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {proposals.length === 0 && (
              <div className="col-span-full p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-4 shadow-sm">
                    <FileText className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
                  </div>
                  <h3 className="text-base font-extrabold uppercase tracking-widest text-zinc-900 dark:text-zinc-100">
                    {t('no_proposals')}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm mx-auto font-medium leading-relaxed">
                    {t('no_proposals_desc')}
                  </p>
                  <Button 
                    onClick={() => setView('builder')} 
                    variant="outline" 
                    className="mt-6 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 h-10 px-6"
                  >
                    {t('create_first')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- CONVERT TO INVOICE CONFIGURATION MODAL --- */}
        <Dialog open={!!proposalToConvert} onOpenChange={(open) => !open && setProposalToConvert(null)}>
          <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-zinc-950/95 dark:backdrop-blur-xl">
            <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/80">
              <DialogHeader>
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-emerald-600/10 dark:bg-emerald-500/20 rounded-xl border border-emerald-200/50 dark:border-emerald-400/20">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {t('config_invoice')}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs font-medium">
                      {t('config_invoice_desc')}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>
            
            {proposalToConvert && (
              <div className="p-6 grid gap-6 bg-white dark:bg-zinc-950">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="conv-month" className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('cycle_period')}</Label>
                    <Input 
                      id="conv-month"
                      value={conversionMonth} 
                      onChange={e => setConversionMonth(e.target.value)} 
                      placeholder={t('ph_month')}
                      className="h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 font-bold shadow-sm focus-visible:ring-indigo-500/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conv-date" className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('doc_date')}</Label>
                    <Input 
                      id="conv-date"
                      type="date"
                      value={conversionDate} 
                      onChange={e => setConversionDate(e.target.value)} 
                      className="h-10 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-50 dark:[color-scheme:dark] font-bold shadow-sm focus-visible:ring-indigo-500/30"
                    />
                  </div>
                </div>

                <div className="bg-zinc-50/80 dark:bg-zinc-900/40 p-5 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                  <p className="text-xs font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5" /> {t('items_invoiced')}
                  </p>
                  <div className="space-y-3 max-h-40 overflow-y-auto px-1 custom-scrollbar">
                    {proposalToConvert.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between items-start text-xs border-b border-zinc-200 dark:border-zinc-800/80 pb-3 last:border-0 last:pb-0">
                        <span className="text-zinc-700 dark:text-zinc-300 pr-4 font-bold leading-relaxed">
                          {item.title} 
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-200/50 dark:bg-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 font-bold tracking-widest uppercase">
                            x{item.quantity}
                          </span>
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 shrink-0 mt-0.5">{fCurrency(item.quantity * item.unitPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3 rounded-b-lg">
              <Button variant="outline" onClick={() => setProposalToConvert(null)} className="mt-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</Button>
              <Button onClick={confirmConversion} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-emerald-500/20 transition-all active:scale-95 border-none">
                {t('generate_invoice')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- DESTRUCTIVE ACTION ALERT DIALOG --- */}
        <AlertDialog open={!!proposalToDelete} onOpenChange={() => setProposalToDelete(null)}>
          <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800 sm:max-w-md p-0 overflow-hidden">
            <div className="p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-zinc-900 dark:text-zinc-50 font-bold tracking-tight text-lg">
                  {t('delete_title')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mt-2 leading-relaxed">
                  {t('delete_desc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
            <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
              <AlertDialogCancel className="mt-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-500 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-rose-500/20 transition-all active:scale-95 border-none">
                {t('confirm_delete')}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}

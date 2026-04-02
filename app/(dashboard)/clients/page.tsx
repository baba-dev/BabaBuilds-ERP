"use client";

import { useState, useEffect } from "react";
import { 
  Users, Plus, Globe, Building2, Mail, Phone, Briefcase, FileText, 
  Image as ImageIcon, CheckCircle2, Trash2, Pencil, AlertCircle, ChevronLeft, ChevronRight, Loader2 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";

export default function ClientCRM() {
  const t = useTranslations('Clients');
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);

  // --- NEW: PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // --- GLOBALIZATION ENGINE ---
  const { 
    taxLabel = "Tax", 
    taxIdLabel = "Tax ID", 
    countryCode = "Global" 
  } = useFormat();

  const [formData, setFormData] = useState({
    name: "", address: "", country: "", taxId: "", email: "", phone: "", isExport: true
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => { 
    fetchClients(currentPage); 
  }, [currentPage]);

  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;
        
        if (isFresh && data && path === '/clients') {
          setFormData(prev => ({
            ...prev,
            name: data.name || data.client || prev.name,
            address: data.address || prev.address,
            country: data.country || prev.country,
            email: data.email || prev.email,
            phone: data.phone || prev.phone
          }));
          setOpen(true); 
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch(e) {
        console.error("Failed to parse AI payload");
      }
    }
  }, []);

  const fetchClients = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/clients?page=${page}&limit=9`);
      const { data, meta } = await res.json();
      setClients(Array.isArray(data) ? data : []);
      setTotalPages(meta.totalPages);
      setCurrentPage(meta.currentPage);
    } catch (err) {
      toast.error("Failed to load clients.");
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const mode = isEditing ? "Updating" : "Registering new";
    const toastId = toast.loading(`${mode} client...`);

    const body = new FormData();
    Object.entries(formData).forEach(([key, val]) => body.append(key, String(val)));
    if (logoFile) body.append('logo', logoFile);

    try {
      const url = isEditing ? `/api/clients/${selectedClientId}` : '/api/clients';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, body });
      
      if (res.ok) {
        toast.success(isEditing ? "Client updated successfully!" : "Client registered successfully!", { id: toastId });
        setOpen(false);
        resetForm();
        fetchClients(currentPage);
      } else {
        const data = await res.json();
        toast.error(data.message || data.error || (isEditing ? "Failed to update client." : "Failed to register client."), { id: toastId });
      }
    } catch (err) {
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (client: any) => {
    setIsEditing(true);
    setSelectedClientId(client.id);
    setFormData({
      name: client.name || "",
      address: client.address || "",
      country: client.country || "",
      taxId: client.taxId || "",
      email: client.email || "",
      phone: client.phone || "",
      isExport: client.isExport
    });
    setOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: "", address: "", country: "", taxId: "", email: "", phone: "", isExport: true });
    setLogoFile(null);
    setIsEditing(false);
    setSelectedClientId(null);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    const id = clientToDelete;
    const toastId = toast.loading("Deleting client profile...");
    
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Deletion failed");
      }
      
      toast.success("Client permanently removed", { id: toastId });
      // Refresh data. If it was the last item on a page, go to previous page.
      if (clients.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        fetchClients(currentPage);
      }
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setClientToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
        
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 max-w-7xl mx-auto w-full">
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{t('title')}</h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm max-w-xl">{t('description')}</p>
            </div>

            <Button 
              onClick={() => { resetForm(); setOpen(true); }}
              className="w-full md:w-auto shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 text-xs font-bold uppercase tracking-wider h-11 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 md:mr-2" /> <span className="md:inline">{t('onboard_new')}</span>
            </Button>
          </div>
        </div>

        {/* ONBOARDING / EDIT MODAL */}
        <Dialog open={open} onOpenChange={(v) => { if(!v) resetForm(); setOpen(v); }}>
          <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-zinc-950/95 dark:backdrop-blur-xl">
            <div className="px-6 pt-6 pb-5 bg-zinc-50/80 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-800/80">
              <DialogHeader>
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                    <Building2 className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                      {isEditing ? t('edit_registration_title') : t('registration_title')}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs font-medium">
                      {isEditing ? t('edit_registration_desc') : t('registration_desc')}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto bg-white dark:bg-zinc-950 custom-scrollbar">
                
                <div className="p-5 bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800/80 rounded-xl space-y-4">
                  <h3 className="text-xs font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> {t('legal_identity')}</h3>
                  <div className="grid gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="client-name" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">
                        {t('company_name')} <span className="text-rose-500 dark:text-rose-400">*</span>
                      </Label>
                      <Input 
                        id="client-name"
                        placeholder={t('ph_name')} 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        required 
                        className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-address" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">
                        {t('billing_address')} <span className="text-rose-500 dark:text-rose-400">*</span>
                      </Label>
                      <Input 
                        id="client-address"
                        placeholder={t('ph_address')} 
                        value={formData.address} 
                        onChange={e => setFormData({...formData, address: e.target.value})} 
                        required 
                        className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="client-country" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">
                          {t('country')} <span className="text-rose-500 dark:text-rose-400">*</span>
                        </Label>
                        <Input 
                          id="client-country"
                          placeholder={t('ph_country')} 
                          value={formData.country} 
                          onChange={e => setFormData({...formData, country: e.target.value})} 
                          required 
                          className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client-taxid" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">
                          {taxIdLabel} <span className="text-zinc-400 dark:text-zinc-500 font-medium normal-case">(Optional)</span>
                        </Label>
                        <Input 
                          id="client-taxid"
                          placeholder={`Client's ${taxIdLabel}`} 
                          value={formData.taxId} 
                          onChange={e => setFormData({...formData, taxId: e.target.value})} 
                          className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm font-mono text-sm" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-100 dark:border-zinc-800/80 rounded-xl space-y-4">
                  <h3 className="text-xs font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" /> {t('contact_branding')}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client-email" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('email_address')}</Label>
                      <Input 
                        id="client-email"
                        type="email" 
                        placeholder={t('ph_email')} 
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-phone" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('mobile_number')}</Label>
                      <Input 
                        id="client-phone"
                        placeholder={t('ph_phone')} 
                        value={formData.phone} 
                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                        className="h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-all focus-visible:ring-indigo-500/30 focus-visible:border-indigo-500 shadow-sm" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="client-logo" className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider cursor-pointer">
                      <ImageIcon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" /> {t('company_logo')}</Label>
                    <Input 
                      id="client-logo"
                      type="file" 
                      accept="image/*" 
                      onChange={e => setLogoFile(e.target.files?.[0] || null)} 
                      className="h-10 pt-2 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-950/30 dark:file:text-indigo-400 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 shadow-sm cursor-pointer" 
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/40">
                  <div className="space-y-1 mr-4">
                    <Label htmlFor="client-export" className="text-xs font-extrabold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider cursor-pointer flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-500" /> {t('cross_border_export')}</Label>
                    <p className="text-xs font-medium text-indigo-600/80 dark:text-indigo-400/80 mt-0.5 leading-tight">
                      {t('enable_zero_tax', { taxLabel })}
                    </p>
                  </div>
                  <Switch 
                    id="client-export"
                    aria-label="Toggle export status"
                    checked={formData.isExport} 
                    onCheckedChange={val => setFormData({...formData, isExport: val})} 
                    className="data-[state=checked]:bg-indigo-600 dark:data-[state=checked]:bg-indigo-500 shadow-inner"
                  />
                </div>
              </div>

              <DialogFooter className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3 rounded-b-lg">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white dark:hover:bg-indigo-500 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-indigo-500/20 transition-all active:scale-95 border-none" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                       <Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}</span>
                  ) : isEditing ? t('update_client') : t('register_client')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/20 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500/50" />
            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">{t('loading_roster')}</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="col-span-full p-12 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/50 dark:bg-zinc-950/20 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center mb-4 shadow-sm">
                <Users className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
              </div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">{t('no_clients_yet')}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm mx-auto font-medium leading-relaxed">{t('no_clients_desc')}</p>
              <Button 
                onClick={() => setOpen(true)} 
                variant="outline" 
                className="mt-6 border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 bg-white dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 h-10 px-6"
              >{t('onboard_first')}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map((client) => (
                <Card key={client.id} className="group relative hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 overflow-hidden flex flex-col">
                  <div className="absolute top-4 right-4 flex gap-2 z-10">
                    <button 
                      onClick={() => handleEdit(client)} 
                      aria-label={`Edit ${client.name}`}
                      className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg opacity-100 sm:opacity-0 xl:opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-indigo-600 dark:hover:bg-indigo-600 hover:text-white dark:hover:text-white shadow-sm sm:shadow-none hover:shadow-md active:scale-95" 
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setClientToDelete(client.id)} 
                      aria-label={`Delete ${client.name}`}
                      className="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg opacity-100 sm:opacity-0 xl:opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-rose-600 dark:hover:bg-rose-600 hover:text-white dark:hover:text-white shadow-sm sm:shadow-none hover:shadow-md active:scale-95" 
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <CardHeader className="flex flex-row items-center gap-4 pb-5 pt-6 px-6 border-b border-zinc-100 dark:border-zinc-800/80">
                    <Avatar className="h-12 w-12 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <AvatarImage src={client.logoUrl} alt={client.name} />
                      <AvatarFallback className="bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 text-xs font-bold">
                        <Building2 className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 pr-8">
                      <CardTitle className="text-lg font-extrabold tracking-tight truncate dark:text-zinc-50">
                        {client.name}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                          <Globe className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[100px]">{client.country}</span>
                        </div>
                        {client.isExport ? (
                          <Badge className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 text-xs font-bold uppercase tracking-widest px-2 py-0.5 shadow-none">{t('export')}</Badge>
                        ) : (
                          <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-xs font-bold uppercase tracking-widest px-2 py-0.5 shadow-none">{t('domestic')}</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3.5 p-6 bg-zinc-50/50 dark:bg-zinc-950/30 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex items-start gap-2.5">
                      <Briefcase className="w-4 h-4 mt-0.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span className="line-clamp-2 font-medium leading-relaxed text-xs">
                        {client.address}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5 pt-1.5">
                      {client.email && (
                        <div className="flex items-center gap-2.5 text-xs font-medium">
                          <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" /> 
                          <span className="truncate">{client.email}</span>
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-2.5 text-xs font-medium">
                          <Phone className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" /> 
                          <span className="truncate">{client.phone}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 mt-auto border-t border-dashed border-zinc-200 dark:border-zinc-800">
                      <div className="flex flex-col">
                        <p className="text-xs uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-widest">
                          {taxIdLabel}
                        </p>
                        <p className={`text-xs font-mono font-bold mt-1 ${client.taxId ? 'text-zinc-900 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600'}`}>
                          {client.taxId || t('unregistered')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* --- PAGINATION CONTROLS --- */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-4 animate-in fade-in duration-500">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(p => p - 1)} 
                  disabled={currentPage <= 1}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 px-4"
                >
                  <ChevronLeft className="w-4 h-4 mr-1.5" /> {t('prev')}</Button>
                <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 uppercase tracking-widest">
                  {currentPage} <span className="text-zinc-400 dark:text-zinc-600">/</span> {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)} 
                  disabled={currentPage >= totalPages}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 px-4"
                >
                  {t('next')} <ChevronRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* DESTRUCTIVE ACTION ALERT DIALOG */}
        <AlertDialog open={!!clientToDelete} onOpenChange={() => setClientToDelete(null)}>
          <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800 sm:max-w-md p-0 overflow-hidden">
            <div className="p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-zinc-900 dark:text-zinc-50 font-bold tracking-tight text-lg">{t('delete_title')}</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mt-2 leading-relaxed">{t('delete_desc')}</AlertDialogDescription>
              </AlertDialogHeader>
            </div>
            <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
              <AlertDialogCancel className="mt-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-500 text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-rose-500/20 transition-all active:scale-95 border-none">{t('confirm_delete')}</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
}

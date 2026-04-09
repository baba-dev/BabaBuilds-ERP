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
import { toast } from "sonner";
import { FileUploadField } from "@/components/forms/file-upload-field";
import { FormFieldRow, FormSection, FormSubmitBar } from "@/components/forms/form-primitives";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { getBustedUrl } from "@/lib/cache-buster";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { CLIENT_LOGO_ACCEPT_ATTR, CLIENT_LOGO_HELP_TEXT } from "@/lib/uploads/client-logo";
import { type ClientDto, type ApiEnvelope } from "@/lib/types/business";
import { useSearchParams } from "next/navigation";

export default function ClientCRM() {
  const t = useTranslations('Clients');
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [hasHandledProtocolRecord, setHasHandledProtocolRecord] = useState(false);

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
    setFetchError(null);
    try {
      const res = await fetch(`/api/clients?page=${page}&limit=9`);
      const { data, meta } = (await res.json()) as ApiEnvelope<ClientDto[]>;
      setClients(Array.isArray(data) ? data : []);
      setTotalPages(meta.totalPages);
      setCurrentPage(meta.currentPage);
    } catch (err) {
      toast.error("Failed to load clients.");
      setFetchError("Failed to load clients.");
      setClients([]);
      setTotalPages(1);
      setCurrentPage(1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const mode = isEditing ? t("toast.loading.update_client") : t("toast.loading.register_client");
    const toastId = toast.loading(mode);

    const body = new FormData();
    Object.entries(formData).forEach(([key, val]) => body.append(key, String(val)));
    if (logoFile) body.append('logo', logoFile);

    try {
      const url = isEditing ? `/api/clients/${selectedClientId}` : '/api/clients';
      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, body });
      
      if (res.ok) {
        toast.success(isEditing ? t("toast.success.client_updated") : t("toast.success.client_registered"), { id: toastId });
        setOpen(false);
        resetForm();
        fetchClients(currentPage);
      } else {
        const data = await res.json();
        toast.error(data.message || data.error || (isEditing ? t("toast.error.update_client") : t("toast.error.register_client")), { id: toastId });
      }
    } catch (err) {
      toast.error(t("toast.error.network"), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (client: ClientDto) => {
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
    const toastId = toast.loading(t("toast.loading.delete_client"));
    
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || t("toast.error.delete_client"));
      }
      
      toast.success(t("toast.success.client_deleted"), { id: toastId });
      // Refresh data. If it was the last item on a page, go to previous page.
      if (clients.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        fetchClients(currentPage);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Deletion failed", { id: toastId });
    } finally {
      setClientToDelete(null);
    }
  };

  useEffect(() => {
    const protocolRecord = searchParams.get("protocolRecord");
    const protocolEntity = searchParams.get("protocolEntity");

    if (hasHandledProtocolRecord || !protocolRecord || protocolEntity !== "client") {
      return;
    }

    setHasHandledProtocolRecord(true);
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(protocolRecord)}`);
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.data) {
          toast.error("Could not open deep-linked client.");
          return;
        }
        const client = payload.data as ClientDto;
        setIsEditing(true);
        setSelectedClientId(client.id);
        setFormData({
          name: client.name || "",
          address: client.address || "",
          country: client.country || "",
          taxId: client.taxId || "",
          email: client.email || "",
          phone: client.phone || "",
          isExport: client.isExport,
        });
        setOpen(true);
        toast.success("Deep-linked client opened.");
      } catch {
        toast.error("Could not open deep-linked client.");
      }
    })();
  }, [hasHandledProtocolRecord, searchParams]);

  return (
    <DashboardPageShell
      title={t('title')}
      description={t('description')}
      primaryAction={
        <Button 
          onClick={() => { resetForm(); setOpen(true); }}
          className="btn-primary w-full md:w-auto shrink-0 text-xs uppercase tracking-wider h-11"
        >
          <Plus className="w-4 h-4 md:mr-2" /> <span className="md:inline">{t('onboard_new')}</span>
        </Button>
      }
    >

        {/* ONBOARDING / EDIT MODAL */}
        <Dialog open={open} onOpenChange={(v) => { if(!v) resetForm(); setOpen(v); }}>
          <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-2xl bg-surface-elevated dark:backdrop-blur-xl border border-border">
            <div className="px-6 pt-6 pb-5 bg-surface-glass border-b border-border">
              <DialogHeader>
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 bg-accent-soft rounded-xl border border-accent-strong/25">
                    <Building2 className="w-5 h-5 text-accent-strong" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                      {isEditing ? t('edit_registration_title') : t('registration_title')}
                    </DialogTitle>
                    <DialogDescription className="text-muted-body mt-1 text-xs font-medium">
                      {isEditing ? t('edit_registration_desc') : t('registration_desc')}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto bg-surface-elevated custom-scrollbar">
                
                <FormSection
                  title={t('legal_identity')}
                  icon={<FileText className="w-3.5 h-3.5" />}
                  className="bg-surface-base border-border"
                >
                  <div className="grid gap-5">
                    <FormFieldRow htmlFor="client-name" label={t('company_name')} required>
                      <Input 
                        id="client-name"
                        placeholder={t('ph_name')} 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        required 
                        className="h-10 bg-surface-elevated border-border text-foreground font-bold transition-all focus-visible:ring-focus-ring/30 focus-visible:border-accent-strong shadow-sm" 
                      />
                    </FormFieldRow>
                    <FormFieldRow htmlFor="client-address" label={t('billing_address')} required>
                      <Input 
                        id="client-address"
                        placeholder={t('ph_address')} 
                        value={formData.address} 
                        onChange={e => setFormData({...formData, address: e.target.value})} 
                        required 
                        className="h-10 bg-surface-elevated border-border text-foreground transition-all focus-visible:ring-focus-ring/30 focus-visible:border-accent-strong shadow-sm" 
                      />
                    </FormFieldRow>
                    <div className="grid grid-cols-2 gap-4">
                      <FormFieldRow htmlFor="client-country" label={t('country')} required>
                        <Input 
                          id="client-country"
                          placeholder={t('ph_country')} 
                          value={formData.country} 
                          onChange={e => setFormData({...formData, country: e.target.value})} 
                          required 
                          className="h-10 bg-surface-elevated border-border text-foreground transition-all focus-visible:ring-focus-ring/30 focus-visible:border-accent-strong shadow-sm" 
                        />
                      </FormFieldRow>
                      <FormFieldRow htmlFor="client-taxid" label={taxIdLabel} optionalText={t("optional")}>
                        <Input 
                          id="client-taxid"
                          placeholder={`Client's ${taxIdLabel}`} 
                          value={formData.taxId} 
                          onChange={e => setFormData({...formData, taxId: e.target.value})} 
                          className="h-10 bg-surface-elevated border-border text-foreground transition-all focus-visible:ring-focus-ring/30 focus-visible:border-accent-strong shadow-sm font-mono text-sm" 
                        />
                      </FormFieldRow>
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title={t('contact_branding')}
                  icon={<Mail className="w-3.5 h-3.5" />}
                  className="bg-surface-base border-border"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client-email" className="text-foreground/80 text-xs font-bold uppercase tracking-wider">{t('email_address')}</Label>
                      <Input 
                        id="client-email"
                        type="email" 
                        placeholder={t('ph_email')} 
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                        className="h-10 bg-surface-elevated border-border text-foreground transition-all focus-visible:ring-focus-ring/30 focus-visible:border-accent-strong shadow-sm" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-phone" className="text-foreground/80 text-xs font-bold uppercase tracking-wider">{t('mobile_number')}</Label>
                      <Input 
                        id="client-phone"
                        placeholder={t('ph_phone')} 
                        value={formData.phone} 
                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                        className="h-10 bg-surface-elevated border-border text-foreground transition-all focus-visible:ring-focus-ring/30 focus-visible:border-accent-strong shadow-sm" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="client-logo" className="flex items-center gap-2 text-foreground/80 text-xs font-bold uppercase tracking-wider cursor-pointer">
                      <ImageIcon className="w-3.5 h-3.5 text-muted-body" /> {t('company_logo')}</Label>
                    <FileUploadField
                      id="client-logo"
                      accept={CLIENT_LOGO_ACCEPT_ATTR}
                      helpText={CLIENT_LOGO_HELP_TEXT}
                      onFileSelect={setLogoFile}
                      inputClassName="bg-surface-elevated border-border text-foreground file:bg-accent-soft file:text-accent-strong hover:file:brightness-95 shadow-sm"
                    />
                  </div>
                </FormSection>

                <div className="flex items-center justify-between p-5 rounded-xl bg-accent-soft/70 border border-accent-strong/20">
                  <div className="space-y-1 mr-4">
                    <Label htmlFor="client-export" className="text-xs font-extrabold text-accent-strong uppercase tracking-wider cursor-pointer flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-accent-strong" /> {t('cross_border_export')}</Label>
                    <p className="text-xs font-medium text-accent-strong/80 mt-0.5 leading-tight">
                      {t('enable_zero_tax', { taxLabel })}
                    </p>
                  </div>
                  <Switch 
                    id="client-export"
                    aria-label={t("a11y.toggle_export")}
                    checked={formData.isExport} 
                    onCheckedChange={val => setFormData({...formData, isExport: val})} 
                    className="data-[state=checked]:bg-accent-strong shadow-inner"
                  />
                </div>
              </div>

              <DialogFooter className="px-6 py-4 bg-surface-glass border-t border-border flex justify-end gap-3 rounded-b-lg block">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-surface-elevated border-border text-muted-body hover:bg-surface-base text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</Button>
                <FormSubmitBar
                  isSubmitting={isSubmitting}
                  submitText={isEditing ? t('update_client') : t('register_client')}
                  submittingText={t('saving')}
                  helperText={isEditing ? t("helper_edit") : t("helper_create")}
                  className="mt-3 border-none bg-transparent p-0"
                />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-body bg-surface-base border-2 border-dashed border-border rounded-2xl">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent-strong/50" />
            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">{t('loading_roster')}</span>
          </div>
        ) : fetchError ? (
          <div className="col-span-full p-12 text-center border-2 border-dashed border-rose-300/50 rounded-2xl bg-rose-50/20 dark:bg-rose-500/5">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-rose-100/70 dark:bg-rose-500/10 border border-rose-300/50 dark:border-rose-500/20 flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-base font-extrabold text-foreground uppercase tracking-widest">Unable to load clients</h3>
              <p className="text-sm text-muted-body mt-2 max-w-sm mx-auto font-medium leading-relaxed">{fetchError}</p>
              <Button
                onClick={() => fetchClients(currentPage)}
                variant="outline"
                className="mt-6 text-xs font-bold uppercase tracking-wider h-10 px-6"
              >
                Retry
              </Button>
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div className="col-span-full p-12 text-center border-2 border-dashed border-border rounded-2xl bg-surface-base relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-soft/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border flex items-center justify-center mb-4 shadow-sm">
                <Users className="w-7 h-7 text-muted-body" />
              </div>
              <h3 className="text-base font-extrabold text-foreground uppercase tracking-widest">{t('no_clients_yet')}</h3>
              <p className="text-sm text-muted-body mt-2 max-w-sm mx-auto font-medium leading-relaxed">{t('no_clients_desc')}</p>
              <Button 
                onClick={() => setOpen(true)} 
                variant="outline" 
                className="mt-6 border-accent-strong/30 text-accent-strong bg-surface-elevated hover:bg-accent-soft/70 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 h-10 px-6"
              >{t('onboard_first')}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map((client) => (
                <Card key={client.id} className="group relative hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border bg-surface-elevated overflow-hidden flex flex-col">
                  <div className="absolute top-4 right-4 flex gap-2 z-10">
                    <button 
                      onClick={() => handleEdit(client)} 
                      aria-label={t("a11y.edit_client", { name: client.name })}
                      className="p-2 bg-accent-soft text-accent-strong rounded-lg opacity-100 sm:opacity-0 xl:opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-accent-strong hover:text-white shadow-sm sm:shadow-none hover:shadow-md active:scale-95" 
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setClientToDelete(client.id)} 
                      aria-label={t("a11y.delete_client", { name: client.name })}
                      className="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg opacity-100 sm:opacity-0 xl:opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-rose-600 dark:hover:bg-rose-600 hover:text-white dark:hover:text-white shadow-sm sm:shadow-none hover:shadow-md active:scale-95" 
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <CardHeader className="flex flex-row items-center gap-4 pb-5 pt-6 px-6 border-b border-border">
                    <Avatar className="h-12 w-12 border border-border shadow-sm">
                      <AvatarImage src={getBustedUrl(client.logoUrl, client.updatedAt)} alt={client.name} />
                      <AvatarFallback className="bg-surface-base text-muted-body text-xs font-bold">
                        <Building2 className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 pr-8">
                      <CardTitle className="text-lg font-extrabold tracking-tight truncate text-foreground">
                        {client.name}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-body font-bold uppercase tracking-wider">
                          <Globe className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[100px]">{client.country}</span>
                        </div>
                        {client.isExport ? (
                          <Badge className="bg-accent-soft text-accent-strong border border-accent-strong/30 text-xs font-bold uppercase tracking-widest px-2 py-0.5 shadow-none">{t('export')}</Badge>
                        ) : (
                          <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-xs font-bold uppercase tracking-widest px-2 py-0.5 shadow-none">{t('domestic')}</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3.5 p-6 bg-surface-base text-sm text-muted-body">
                    <div className="flex items-start gap-2.5">
                      <Briefcase className="w-4 h-4 mt-0.5 text-muted-body shrink-0" />
                      <span className="line-clamp-2 font-medium leading-relaxed text-xs">
                        {client.address}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5 pt-1.5">
                      {client.email && (
                        <div className="flex items-center gap-2.5 text-xs font-medium">
                          <Mail className="w-4 h-4 text-muted-body shrink-0" /> 
                          <span className="truncate">{client.email}</span>
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-2.5 text-xs font-medium">
                          <Phone className="w-4 h-4 text-muted-body shrink-0" /> 
                          <span className="truncate">{client.phone}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 mt-auto border-t border-dashed border-border">
                      <div className="flex flex-col">
                        <p className="text-xs uppercase font-bold text-muted-body tracking-widest">
                          {taxIdLabel}
                        </p>
                        <p className={`text-xs font-mono font-bold mt-1 ${client.taxId ? 'text-foreground/90' : 'text-muted-body/70'}`}>
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
                  className="bg-surface-elevated border-border text-foreground/80 hover:bg-surface-base text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 px-4"
                >
                  <ChevronLeft className="w-4 h-4 mr-1.5" /> {t('prev')}</Button>
                <div className="text-xs font-bold text-muted-body bg-surface-base px-3 py-1.5 rounded-lg border border-border uppercase tracking-widest">
                  {currentPage} <span className="text-muted-body/70">/</span> {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(p => p + 1)} 
                  disabled={currentPage >= totalPages}
                  className="bg-surface-elevated border-border text-foreground/80 hover:bg-surface-base text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 px-4"
                >
                  {t('next')} <ChevronRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* DESTRUCTIVE ACTION ALERT DIALOG */}
        <AlertDialog open={!!clientToDelete} onOpenChange={() => setClientToDelete(null)}>
          <AlertDialogContent className="bg-surface-elevated border-border sm:max-w-md p-0 overflow-hidden">
            <div className="p-6">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground font-bold tracking-tight text-lg">{t('delete_title')}</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-body text-sm font-medium mt-2 leading-relaxed">{t('delete_desc')}</AlertDialogDescription>
              </AlertDialogHeader>
            </div>
            <div className="px-6 py-4 bg-surface-glass border-t border-border flex justify-end gap-3">
              <AlertDialogCancel className="mt-0 bg-surface-elevated border-border text-muted-body hover:bg-surface-base text-xs font-bold uppercase tracking-widest px-5">{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="action-destructive text-xs uppercase tracking-widest px-6 border-none">{t('confirm_delete')}</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

    </DashboardPageShell>
  );
}

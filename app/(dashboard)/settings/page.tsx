"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Building2, Landmark, ShieldCheck, Image as ImageIcon, CheckCircle2,
  Mailbox, Bot, Trash2, CreditCard, Lock, Globe, AlertTriangle,
  Loader2, Info, Users, Mail, Clock, UserPlus, ArrowRight, Sparkles, Users2, FileText, HandCoins, Target, Siren, ChartColumnBig
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getBustedUrl } from "@/lib/cache-buster";
import { FileUploadField } from "@/components/forms/file-upload-field";
import { FormFieldMessages, FormSection, FormSubmitBar } from "@/components/forms/form-primitives";
import { PWASettings } from "@/components/settings/pwa-settings";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/ui/typography";
import { Badge } from "@/components/ui/badge";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";

export default function SettingsWizard() {
  /**
   * Clearable optional fields: if a user clears these inputs in the UI,
   * we still submit them as explicit empty strings so the API can persist null/empty
   * instead of treating the field as "omitted / no change".
   */
  const CLEARABLE_OPTIONAL_FIELDS = new Set([
    "phone",
    "website",
    "udyamNumber",
    "gstin",
    "smtpHost",
    "smtpPort",
    "smtpUser",
    "smtpFromEmail",
    "razorpayKeyId",
    "stripePublishableKey",
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  // Module toggles
  const [workforceEnabled, setWorkforceEnabled] = useState(false);
  const [workforceLoading, setWorkforceLoading] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [payrollEnabled, setPayrollEnabled] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [showDisablePayrollConfirm, setShowDisablePayrollConfirm] = useState(false);
  const [documentsEnabled, setDocumentsEnabled] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [showDisableDocumentsConfirm, setShowDisableDocumentsConfirm] = useState(false);
  const [cashFlowEnabled, setCashFlowEnabled] = useState(false);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);
  const [showDisableCashFlowConfirm, setShowDisableCashFlowConfirm] = useState(false);
  const [reportingCenterEnabled, setReportingCenterEnabled] = useState(false);
  const [reportingCenterLoading, setReportingCenterLoading] = useState(false);
  const [showDisableReportingCenterConfirm, setShowDisableReportingCenterConfirm] = useState(false);
  const [arCollectionsEnabled, setArCollectionsEnabled] = useState(false);
  const [arCollectionsLoading, setArCollectionsLoading] = useState(false);
  const [showDisableArCollectionsConfirm, setShowDisableArCollectionsConfirm] = useState(false);
  const [revenuePipelineEnabled, setRevenuePipelineEnabled] = useState(false);
  const [revenuePipelineLoading, setRevenuePipelineLoading] = useState(false);
  const [showDisableRevenuePipelineConfirm, setShowDisableRevenuePipelineConfirm] = useState(false);
  // Team invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isNewSetup, setIsNewSetup] = useState(true);
  const [countryCode, setCountryCode] = useState<string>("IN");
  const [activeGatewayTab, setActiveGatewayTab] = useState<"RAZORPAY" | "STRIPE">("RAZORPAY");

  // Form State
  const [formData, setFormData] = useState({
    companyName: "", proprietorName: "", address: "", email: "", phone: "", website: "",
    panNumber: "", udyamNumber: "", gstin: "",
    bankName: "", accountName: "", accountNumber: "", ifscCode: "",
    smtpHost: "", smtpPort: "", smtpUser: "", smtpPassword: "", smtpFromEmail: "", 
    groqApiKey: "", invoiceTheme: "DESIGN_1", locale: "en-IN", 
    existingLogoUrl: "", existingSignatureUrl: "", defaultSacCode: "998313",
    // Razorpay (PRO only — INR / Indian users)
    razorpayKeyId: "", razorpayKeySecret: "",
    // Stripe (PRO only — global)
    stripePublishableKey: "", stripeSecretKey: "",
    // Gateway preference
    defaultGateway: "RAZORPAY",
    // Shop / E-Store
    shopSlug: "", shopTagline: "", shopEnabled: false, shopAccentColor: "#6366f1",
  });

  const [planTier, setPlanTier] = useState<string>("FREE");
  
  const t = useTranslations('Settings');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  const isIndian = countryCode === "IN";
  const isTeamPlan = planTier === "TEAM" || planTier === "ENTERPRISE";

  const workspaceModulesAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash === "workspace-modules") {
      workspaceModulesAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    // Fetch workspace modules state
    void fetch('/api/workspace/modules')
      .then((r) => r.json())
      .then((d: { modules?: string[] }) => {
        if (Array.isArray(d.modules)) {
          setWorkforceEnabled(d.modules.includes('WORKFORCE'));
          setPayrollEnabled(d.modules.includes('PAYROLL'));
          setDocumentsEnabled(d.modules.includes('DOCUMENTS'));
          setCashFlowEnabled(d.modules.includes('CASH_FLOW'));
          setReportingCenterEnabled(d.modules.includes('REPORTING_CENTER'));
          setArCollectionsEnabled(d.modules.includes('AR_COLLECTIONS'));
          setRevenuePipelineEnabled(d.modules.includes('REVENUE_PIPELINE'));
        }
      })
      .catch(() => {});

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && data.companyName) {
          setIsNewSetup(false);
          setPlanTier(data.planTier || "FREE");
          const detectedCountry = data.countryCode || "IN";
          setCountryCode(detectedCountry);

          const gateway = data.defaultGateway || (detectedCountry === "IN" ? "RAZORPAY" : "STRIPE");
          setActiveGatewayTab(gateway as "RAZORPAY" | "STRIPE");

          setFormData({
            companyName: data.companyName || "", proprietorName: data.proprietorName || "", 
            address: data.address || "", email: data.email || "", 
            phone: data.phone || "", website: data.website || "",
            panNumber: data.panNumber || "", udyamNumber: data.udyamNumber || "", gstin: data.gstin || "",
            bankName: data.bankName || "", accountName: data.accountName || "", 
            accountNumber: data.accountNumber || "", ifscCode: data.ifscCode || "",
            smtpHost: data.smtpHost || "", smtpPort: data.smtpPort || "", 
            smtpUser: data.smtpUser || "", smtpPassword: data.smtpPassword || "", 
            smtpFromEmail: data.smtpFromEmail || "",
            groqApiKey: data.groqApiKey || "", 
            invoiceTheme: data.invoiceTheme || "DESIGN_1",
            locale: data.locale || "en-IN",
            existingLogoUrl: data.logoUrl || "",
            existingSignatureUrl: data.signatureUrl || "",
            defaultSacCode: data.defaultSacCode || "998313",
            razorpayKeyId:     data.razorpayKeyId     || "",
            razorpayKeySecret: data.razorpayKeySecret || "",
            stripePublishableKey: data.stripePublishableKey || "",
            stripeSecretKey:      data.stripeSecretKey      || "",
            defaultGateway: gateway,
            // Shop
            shopSlug:        data.shopSlug        || "",
            shopTagline:     data.shopTagline      || "",
            shopEnabled:     data.shopEnabled      ?? false,
            shopAccentColor: data.shopAccentColor  || "#6366f1",
          });
        }
      })
      .catch(err => {
        console.error("Failed to load settings:", err);
        toast.error(t("toasts.loadFailed"));
      });
  }, []);

  // AI Auto-Fill Hook
  useEffect(() => {
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;
        
        if (isFresh && data && path === '/settings') {
          setFormData(prev => ({
            ...prev,
            companyName: data.companyName || prev.companyName,
            proprietorName: data.proprietorName || prev.proprietorName,
            address: data.address || prev.address,
            email: data.email || prev.email,
            phone: data.phone || prev.phone,
            website: data.website || prev.website,
            panNumber: data.panNumber || prev.panNumber,
            udyamNumber: data.udyamNumber || prev.udyamNumber,
            gstin: data.gstin || prev.gstin,
            bankName: data.bankName || prev.bankName,
            accountName: data.accountName || prev.accountName,
            accountNumber: data.accountNumber || prev.accountNumber,
            ifscCode: data.ifscCode || prev.ifscCode,
          }));
          toast.info(t("toasts.aiAutofill"));
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch(e) { 
        console.error("Failed to parse AI payload"); 
        toast.warning(t("toasts.aiAutofillFailed"));
      }
    }
  }, []);

  const handleGatewayTabChange = (tab: "RAZORPAY" | "STRIPE") => {
    // 11.3 FIX: switching the view tab only changes which credentials panel is visible.
    // It does NOT auto-mutate the stored defaultGateway preference.
    // The defaultGateway is only updated if the user explicitly clicks "Set as Default".
    setActiveGatewayTab(tab);
  };

  const handleSetDefaultGateway = (tab: "RAZORPAY" | "STRIPE") => {
    setActiveGatewayTab(tab);
    setFormData(prev => ({ ...prev, defaultGateway: tab }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMsg(false);
    const toastId = toast.loading(t("toasts.saving"));

    const body = new FormData();
    Object.entries(formData).forEach(([key, val]) => {
      const shouldSendExplicitEmpty =
        CLEARABLE_OPTIONAL_FIELDS.has(key) && (val === "" || val === null || val === undefined);

      if (shouldSendExplicitEmpty) {
        body.append(key, "");
        return;
      }

      if (val !== "" && val !== null && val !== undefined) {
        body.append(key, String(val));
      }
    });
    
    if (logoFile) body.append('logo', logoFile);
    if (signatureFile) body.append('signature', signatureFile);
    // Shop / E-Store fields
    body.append('shopSlug',        formData.shopSlug || '');
    body.append('shopTagline',     formData.shopTagline || '');
    body.append('shopEnabled',     String(!!formData.shopEnabled));
    body.append('shopAccentColor', formData.shopAccentColor || '#6366f1');

    try {
      const res = await fetch('/api/settings', { method: 'POST', body });
      if (res.ok) {
        setSuccessMsg(true);
        setIsNewSetup(false);
        toast.success(t("toasts.saved"), { id: toastId });
        setTimeout(() => setSuccessMsg(false), 3000);
        
        setFormData(prev => ({
          ...prev,
          smtpPassword:      prev.smtpPassword      === "DELETE_KEY" ? "" : prev.smtpPassword,
          groqApiKey:        prev.groqApiKey        === "DELETE_KEY" ? "" : prev.groqApiKey,
          razorpayKeySecret: prev.razorpayKeySecret === "DELETE_KEY" ? "" : prev.razorpayKeySecret,
          stripeSecretKey:   prev.stripeSecretKey   === "DELETE_KEY" ? "" : prev.stripeSecretKey,
        }));
        
        // Refresh the page after saving to apply translations if language changed
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(t("toasts.saveFailed"), { id: toastId });
      }
    } catch (err) {
      toast.error(t("toasts.networkError"), { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Stripe Secret UI component (mirrors the Razorpay one) ─────────────────
  const StripeSecretInput = () => {
    if (formData.stripeSecretKey === "SET") {
      return (
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-10 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{t("secret.configured")}</span>
          </div>
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE"}
            onClick={() => setFormData({ ...formData, stripeSecretKey: "" })}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          >{t("actions.change")}</Button>
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE"}
            onClick={() => setFormData({ ...formData, stripeSecretKey: "DELETE_KEY", stripePublishableKey: "" })}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
          ><Trash2 className="w-4 h-4" /></Button>
        </div>
      );
    }
    return (
      <div className="flex gap-2">
        <Input
          id="stripe-secret-key"
          type={formData.stripeSecretKey === "DELETE_KEY" ? "text" : "password"}
          disabled={planTier === "FREE"}
          value={formData.stripeSecretKey}
          onChange={e => setFormData({ ...formData, stripeSecretKey: e.target.value })}
          placeholder={t("placeholders.stripeSecretKey")}
          className={`dark:bg-zinc-950 dark:border-zinc-800 font-mono text-sm ${
            formData.stripeSecretKey === "DELETE_KEY"
              ? "text-rose-600 font-bold bg-rose-50 dark:bg-rose-900/20"
              : "dark:text-zinc-100"
          }`}
        />
        {formData.stripeSecretKey !== "" && (
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE"}
            onClick={() => setFormData({ ...formData, stripeSecretKey: "DELETE_KEY", stripePublishableKey: "" })}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
          ><Trash2 className="w-4 h-4" /></Button>
        )}
      </div>
    );
  };

  // ── Razorpay Secret UI component ──────────────────────────────────────────
  const RazorpaySecretInput = () => {
    if (formData.razorpayKeySecret === "SET") {
      return (
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-10 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{t("secret.configured")}</span>
          </div>
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE" || !isIndian}
            onClick={() => setFormData({ ...formData, razorpayKeySecret: "" })}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          >{t("actions.change")}</Button>
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE" || !isIndian}
            onClick={() => setFormData({ ...formData, razorpayKeySecret: "DELETE_KEY", razorpayKeyId: "" })}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
          ><Trash2 className="w-4 h-4" /></Button>
        </div>
      );
    }
    return (
      <div className="flex gap-2">
        <Input
          id="razorpay-key-secret"
          type={formData.razorpayKeySecret === "DELETE_KEY" ? "text" : "password"}
          disabled={planTier === "FREE" || !isIndian}
          value={formData.razorpayKeySecret}
          onChange={e => setFormData({ ...formData, razorpayKeySecret: e.target.value })}
          placeholder="••••••••••••••••••••"
          className={`dark:bg-zinc-950 dark:border-zinc-800 font-mono text-sm ${
            formData.razorpayKeySecret === "DELETE_KEY"
              ? "text-rose-600 font-bold bg-rose-50 dark:bg-rose-900/20"
              : "dark:text-zinc-100"
          }`}
        />
        {formData.razorpayKeySecret !== "" && (
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE" || !isIndian}
            onClick={() => setFormData({ ...formData, razorpayKeySecret: "DELETE_KEY", razorpayKeyId: "" })}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
          ><Trash2 className="w-4 h-4" /></Button>
        )}
      </div>
    );
  };

  // ── Groq API Key UI component ─────────────────────────────────────────────
  const GroqSecretInput = () => {
    if (formData.groqApiKey === "SET") {
      return (
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 h-10 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 px-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{t("secret.configured")}</span>
          </div>
          <Button
            type="button" variant="outline"
            onClick={() => setFormData({ ...formData, groqApiKey: "" })}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          >{t("actions.change")}</Button>
          <Button
            type="button" variant="outline"
            onClick={() => setFormData({ ...formData, groqApiKey: "DELETE_KEY" })}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
          ><Trash2 className="w-4 h-4" /></Button>
        </div>
      );
    }
    return (
      <div className="flex gap-2">
        <Input
          id="groq-api-key"
          type={formData.groqApiKey === "DELETE_KEY" ? "text" : "password"}
          value={formData.groqApiKey}
          onChange={e => setFormData({ ...formData, groqApiKey: e.target.value })}
          placeholder={t("placeholders.groqApiKey")}
          className={`dark:bg-zinc-950 dark:border-zinc-800 font-mono text-sm ${
            formData.groqApiKey === "DELETE_KEY"
              ? "text-rose-600 font-bold bg-rose-50 dark:bg-rose-900/20"
              : "dark:text-zinc-100"
          }`}
        />
        {formData.groqApiKey !== "" && (
          <Button
            type="button" variant="outline"
            onClick={() => setFormData({ ...formData, groqApiKey: "DELETE_KEY" })}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
          ><Trash2 className="w-4 h-4" /></Button>
        )}
      </div>
    );
  };

  return (
    <DashboardPageShell
      title={isNewSetup ? t("welcome.title") : t("title")}
      description={isNewSetup ? t("welcome.description") : t("description")}
      icon={<Building2 className="w-5 h-5 text-accent-strong" />}
      headerVariant="compact"
      maxWidthClassName="max-w-4xl"
    >
        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* IDENTITY & BRANDING */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <Building2 className="w-5 h-5 text-indigo-600" /> {t('identity_title')}
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>{t('identity_description')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('company_name')} <span className="text-red-500">*</span></Label>
                  <Input required value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} placeholder={t("placeholders.companyName")} className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('proprietor_name')} <span className="text-red-500">*</span></Label>
                  <Input required value={formData.proprietorName} onChange={e => setFormData({...formData, proprietorName: e.target.value})} placeholder={t("placeholders.proprietorName")} className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('full_address')} <span className="text-red-500">*</span></Label>
                <Input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder={t("placeholders.address")} className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-medium" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('contact_email')} <span className="text-red-500">*</span></Label>
                  <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-medium" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('phone_number')}</Label>
                  <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('website')}</Label>
                  <Input value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} placeholder={t("placeholders.website")} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
              </div>

              {/* INVOICE THEME SELECTOR */}
              <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                <Label className="dark:text-zinc-300 text-base">{t('invoice_theme')}</Label>
                <p className={cn(typography.bodyCopy, "mb-4")}>{t('invoice_theme_desc')}</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* DESIGN 1: Classic */}
                  <div 
                    onClick={() => setFormData({...formData, invoiceTheme: 'DESIGN_1'})}
                    className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                      formData.invoiceTheme === 'DESIGN_1' 
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' 
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
                    }`}
                  >
                    {formData.invoiceTheme === 'DESIGN_1' && (
                      <div className="absolute top-3 right-3 text-indigo-600"><CheckCircle2 className="w-5 h-5" /></div>
                    )}
                    <div className="w-full h-32 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 flex flex-col p-3 mb-3">
                      <div className="flex justify-between w-full mb-4">
                        <div className="w-1/2 h-4 bg-zinc-300 dark:bg-zinc-700 rounded" />
                        <div className="w-1/4 h-8 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      </div>
                      <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                      <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                      <div className="w-3/4 h-2 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    </div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{t('design1_title')}</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('design1_desc')}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> {t("invoiceTheme.supportsSignatures")}
                    </div>
                  </div>

                  {/* DESIGN 2: Modern Agency */}
                  <div 
                    onClick={() => setFormData({...formData, invoiceTheme: 'DESIGN_2'})}
                    className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                      formData.invoiceTheme === 'DESIGN_2' 
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' 
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
                    }`}
                  >
                    {formData.invoiceTheme === 'DESIGN_2' && (
                      <div className="absolute top-3 right-3 text-indigo-600"><CheckCircle2 className="w-5 h-5" /></div>
                    )}
                    <div className="w-full h-32 bg-zinc-100 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden mb-3">
                      <div className="w-full h-12 bg-zinc-800 flex items-center justify-between px-3">
                         <div className="w-1/3 h-3 bg-zinc-600 rounded" />
                         <div className="w-1/4 h-4 bg-zinc-500 rounded" />
                      </div>
                      <div className="p-3">
                        <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                        <div className="w-3/4 h-2 bg-zinc-200 dark:bg-zinc-800 rounded" />
                      </div>
                    </div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{t('design2_title')}</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('design2_desc')}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs font-medium text-rose-500/80 dark:text-rose-400/80">
                      {t("invoiceTheme.noSignatures")}
                    </div>
                  </div>
                </div>
              </div>


              <Separator className="dark:bg-zinc-800" />

              <div className="space-y-2">
                <Label className="flex items-center gap-2 dark:text-zinc-300">{t('language_label')}</Label>
                <div className="flex items-center gap-6">
                  <div className="flex-1">
                    <select 
                      value={formData.locale} 
                      onChange={e => setFormData({...formData, locale: e.target.value})} 
                      className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                    >
                      <option value="en-IN">{t("languageOptions.enIN")}</option>
                      <option value="ar">{t("languageOptions.ar")}</option>
                      <option value="es">{t("languageOptions.es")}</option>
                      <option value="hi">{t("languageOptions.hi")}</option>
                    </select>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('language_description')}</p>
                  </div>
                </div>
              </div>
              
              <Separator className="dark:bg-zinc-800" />

              <FormSection className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-transparent p-0 border-0">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 dark:text-zinc-300"><ImageIcon className="w-4 h-4" /> {t('master_logo')}</Label>
                  <div className="flex items-center gap-4">
                    {formData.existingLogoUrl && !logoFile && (
                      <img src={getBustedUrl(formData.existingLogoUrl)} alt={t("alt.currentLogo")} className="h-12 object-contain bg-white dark:bg-zinc-200 border rounded p-1" />
                    )}
                    <div className="flex-1">
                      <FileUploadField
                        accept="image/*"
                        onFileSelect={setLogoFile}
                        helpText={t('logo_hint')}
                        inputClassName="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="flex items-center gap-2 dark:text-zinc-300">
                      {t("signature.label")}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-zinc-400 cursor-help hover:text-indigo-500 transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[200px] text-xs">
                            <p className="font-bold text-indigo-200 mb-1">{t("signature.tooltip.title")}</p>
                            <ul className="list-disc pl-4 space-y-1">
                              <li>{t("signature.tooltip.transparentBackground")}</li>
                              <li>{t("signature.tooltip.maxSize")}</li>
                              <li>{t("signature.tooltip.aspectRatio")}</li>
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                  </div>
                  <div className="flex items-center gap-4">
                    {formData.existingSignatureUrl && !signatureFile && (
                      <img src={getBustedUrl(formData.existingSignatureUrl)} alt={t("alt.currentSignature")} className="h-12 object-contain bg-white dark:bg-zinc-200 border rounded p-1" />
                    )}
                    <div className="flex-1">
                      <FileUploadField
                        accept="image/png,image/webp"
                        onFileSelect={setSignatureFile}
                        helpText={t("signature.hint")}
                        inputClassName="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </div>
              </FormSection>
            </CardContent>
          </Card>

          {/* COMPLIANCE & TAX */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <ShieldCheck className="w-5 h-5 text-emerald-600" /> {t('compliance_title')}
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>{t('compliance_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                {/* 11.5 FIX: PAN is India-specific — only required for IN workspaces */}
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('pan_number')} {isIndian && <span className="text-red-500">*</span>}</Label>
                <Input required={isIndian} className="h-10 uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold tracking-widest" value={formData.panNumber} onChange={e => setFormData({...formData, panNumber: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('udyam_reg')}</Label>
                <Input className="h-10 uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold tracking-widest" value={formData.udyamNumber} onChange={e => setFormData({...formData, udyamNumber: e.target.value.toUpperCase()})} placeholder={t("placeholders.udyam")} />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('gstin')}</Label>
                <Input className="h-10 uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold tracking-widest" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})} placeholder={t("placeholders.optional")} />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t("defaultSacCode.label")} <span className="text-red-500">*</span></Label>
                <Input required className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" value={formData.defaultSacCode} onChange={e => setFormData({...formData, defaultSacCode: e.target.value})} placeholder={t("defaultSacCode.placeholder")} />
                <p className="text-xs text-zinc-400">{t("defaultSacCode.hint")}</p>
              </div>
            </CardContent>

          </Card>

          {/* BANKING DETAILS */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <Landmark className="w-5 h-5 text-amber-600" /> {t('banking_title')}
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>{t('banking_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('bank_name')} <span className="text-red-500">*</span></Label>
                <Input required value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} placeholder={t("placeholders.bankName")} className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('account_name')} <span className="text-red-500">*</span></Label>
                <Input required value={formData.accountName} onChange={e => setFormData({...formData, accountName: e.target.value})} className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300">{t('account_number')} <span className="text-red-500">*</span></Label>
                <Input required type="password" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('account_number_hint')}</p>
              </div>
              <div className="space-y-2">
                {/* 11.5 FIX: IFSC is India-specific — only required for IN workspaces */}
                <Label className="dark:text-zinc-300">{t('ifsc_code')} {isIndian && <span className="text-red-500">*</span>}</Label>
                <Input required={isIndian} className="uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" value={formData.ifscCode} onChange={e => setFormData({...formData, ifscCode: e.target.value.toUpperCase()})} />
              </div>
            </CardContent>
          </Card>

          {/* EMAIL SERVER (SMTP) */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <Mailbox className="w-5 h-5 text-blue-600" /> {t('smtp_title')}
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>{t('smtp_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3 space-y-2">
                  <Label className="dark:text-zinc-300">{t('smtp_host')}</Label>
                  <Input value={formData.smtpHost} onChange={e => setFormData({...formData, smtpHost: e.target.value})} placeholder={t("placeholders.smtpHost")} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('smtp_port')}</Label>
                  <Input type="number" value={formData.smtpPort} onChange={e => setFormData({...formData, smtpPort: e.target.value})} placeholder={t("placeholders.smtpPort")} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('smtp_user')}</Label>
                  <Input value={formData.smtpUser} onChange={e => setFormData({...formData, smtpUser: e.target.value})} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('smtp_password')}</Label>
                  <div className="flex gap-2">
                    <Input 
                      type={formData.smtpPassword === "DELETE_KEY" ? "text" : "password"} 
                      value={formData.smtpPassword} 
                      onChange={e => setFormData({...formData, smtpPassword: e.target.value})} 
                      placeholder="••••••••••••" 
                      className={`dark:bg-zinc-950 dark:border-zinc-800 ${formData.smtpPassword === "DELETE_KEY" ? "text-rose-600 font-bold bg-rose-50 dark:bg-rose-900/20" : "dark:text-zinc-100"}`}
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setFormData({...formData, smtpPassword: "DELETE_KEY"})}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="dark:text-zinc-300">{t('from_email')}</Label>
                <Input type="email" value={formData.smtpFromEmail} onChange={e => setFormData({...formData, smtpFromEmail: e.target.value})} placeholder={t("placeholders.fromEmail")} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
              </div>
            </CardContent>
          </Card>

          {/* AI ASSISTANT CONFIGURATION */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <Bot className="w-5 h-5 text-purple-600" /> {t('ai_config_title')}
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>{t('ai_config_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label className="dark:text-zinc-300">{t('groq_api_key')}</Label>
                <GroqSecretInput />
              </div>
            </CardContent>
          </Card>

          {/* ── SHOP / E-STORE ── */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <Sparkles className="w-5 h-5 text-indigo-600" /> Public Shop (E-Store)
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>
                Give your clients a beautiful public storefront to browse and purchase your services.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">

              {/* Master switch */}
              <div className="flex items-center justify-between p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Enable Public Shop</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Your shop will be publicly accessible at your chosen URL.
                  </p>
                </div>
                <Switch
                  checked={!!formData.shopEnabled}
                  onCheckedChange={(v) => setFormData({ ...formData, shopEnabled: v })}
                  className="data-[state=checked]:bg-indigo-600"
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">Shop URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400 font-mono whitespace-nowrap">/shop/</span>
                  <Input
                    value={formData.shopSlug}
                    onChange={(e) => {
                      const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                      setFormData({ ...formData, shopSlug: raw });
                    }}
                    placeholder={formData.companyName ? formData.companyName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") : "your-shop"}
                    className="h-10 dark:bg-zinc-950 dark:border-zinc-800 font-mono font-bold"
                  />
                </div>
                {formData.shopSlug && (
                  <a
                    href={`/shop/${formData.shopSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium mt-1"
                  >
                    <ArrowRight className="w-3 h-3" /> Preview: /shop/{formData.shopSlug}
                  </a>
                )}
                <p className="text-xs text-zinc-400">Use lowercase letters, numbers, and hyphens only. Min 3 characters.</p>
              </div>

              {/* Tagline */}
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">Shop Tagline</Label>
                <Input
                  value={formData.shopTagline}
                  onChange={(e) => setFormData({ ...formData, shopTagline: e.target.value })}
                  placeholder="Premium IT solutions for modern businesses..."
                  className="h-10 dark:bg-zinc-950 dark:border-zinc-800"
                />
                <p className="text-xs text-zinc-400">Displayed as a subtitle below your company name on the shop page.</p>
              </div>

              {/* Accent color */}
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">Shop Accent Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.shopAccentColor || "#6366f1"}
                    onChange={(e) => setFormData({ ...formData, shopAccentColor: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 cursor-pointer p-1 bg-white dark:bg-zinc-900"
                  />
                  <div className="flex gap-2">
                    {["#6366f1","#10b981","#f59e0b","#ec4899","#3b82f6","#8b5cf6","#ef4444","#06b6d4"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormData({ ...formData, shopAccentColor: c })}
                        className="w-7 h-7 rounded-lg border-2 transition-all active:scale-95 hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: formData.shopAccentColor === c ? "#000" : "transparent",
                          boxShadow: formData.shopAccentColor === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : "none",
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-zinc-400">Used for buttons, highlights, and branding on your shop page.</p>
              </div>

            </CardContent>
          </Card>

          {/* ── PAYMENT GATEWAY INTEGRATION ── */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative overflow-hidden">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className={cn(typography.sectionHeader, "text-lg flex items-center gap-2")}>
                <CreditCard className="w-5 h-5 text-emerald-600" /> {t("payment.title")}
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>
                {t("payment.description")}
                {!isIndian && (
                  <span className="ml-1 text-violet-600 dark:text-violet-400 font-medium">
                    {t("payment.nonIndianRecommendation")}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">

              {/* PRO GATE: Free users see this notice */}
              {planTier === "FREE" && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                  <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("payment.proFeature.title")}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {t("payment.proFeature.description")}
                    </p>
                  </div>
                </div>
              )}

              {/* DEFAULT GATEWAY SELECTOR — segmented control */}
              <div className={`space-y-3 ${planTier === "FREE" ? "opacity-50 pointer-events-none select-none" : ""}`}>
                <Label className="dark:text-zinc-300 text-sm font-semibold">{t("payment.defaultGateway.label")}</Label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("payment.defaultGateway.hint")}
                </p>
                <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden w-fit">
                  <button
                    type="button"
                    id="gateway-tab-razorpay"
                    onClick={() => handleGatewayTabChange("RAZORPAY")}
                    disabled={planTier === "FREE" || !isIndian}
                    className={`px-5 py-2.5 text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                      activeGatewayTab === "RAZORPAY"
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    } ${(!isIndian) ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    🇮🇳 Razorpay
                    {!isIndian && <span className="text-xs font-normal opacity-70">{t("payment.razorpay.inOnly")}</span>}
                  </button>
                  <button
                    type="button"
                    id="gateway-tab-stripe"
                    onClick={() => handleGatewayTabChange("STRIPE")}
                    disabled={planTier === "FREE"}
                    className={`px-5 py-2.5 text-sm font-semibold transition-all duration-200 flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-700 ${
                      activeGatewayTab === "STRIPE"
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Globe className="w-4 h-4" /> {t("payment.stripe.name")}
                    <span className="text-xs font-normal opacity-70">{t("payment.stripe.global")}</span>
                  </button>
                </div>
              </div>

              {/* ── RAZORPAY PANEL ─────────────────────────────────────────────── */}
              <div className={`rounded-xl border p-5 space-y-5 transition-all duration-200 ${
                activeGatewayTab === "RAZORPAY"
                  ? "border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/30 dark:bg-indigo-950/10"
                  : "border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 opacity-60"
              } ${planTier === "FREE" ? "opacity-50 pointer-events-none select-none" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇮🇳</span>
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{t("payment.razorpay.name")}</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("payment.razorpay.caption")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {formData.defaultGateway === "RAZORPAY" && (
                      <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full">
                        {t("payment.active")}
                      </span>
                    )}
                    {formData.defaultGateway !== "RAZORPAY" && isIndian && planTier !== "FREE" && (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultGateway("RAZORPAY")}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors"
                      >
                        Set as default
                      </button>
                    )}
                  </div>
                </div>

                {/* Non-Indian warning */}
                {!isIndian && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/40">
                    <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-orange-700 dark:text-orange-400">
                      <span className="font-semibold">{t("payment.razorpay.unavailableTitle")}</span> {t("payment.razorpay.unavailableDescription")}
                    </p>
                  </div>
                )}

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${!isIndian ? "opacity-40 pointer-events-none select-none" : ""}`}>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">{t("payment.razorpay.keyIdLabel")}</Label>
                    <Input
                      id="razorpay-key-id"
                      disabled={planTier === "FREE" || !isIndian}
                      value={formData.razorpayKeyId}
                      onChange={e => setFormData({...formData, razorpayKeyId: e.target.value})}
                      placeholder={t("payment.razorpay.keyIdPlaceholder")}
                      className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("payment.razorpay.keyIdHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">{t("payment.razorpay.keySecretLabel")}</Label>
                    <RazorpaySecretInput />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("payment.secretHint")}</p>
                  </div>
                </div>
              </div>

              {/* ── STRIPE PANEL ───────────────────────────────────────────────── */}
              <div className={`rounded-xl border p-5 space-y-5 transition-all duration-200 ${
                activeGatewayTab === "STRIPE"
                  ? "border-violet-200 dark:border-violet-800/50 bg-violet-50/30 dark:bg-violet-950/10"
                  : "border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 opacity-60"
              } ${planTier === "FREE" ? "opacity-50 pointer-events-none select-none" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{t("payment.stripe.name")}</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("payment.stripe.caption")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {formData.defaultGateway === "STRIPE" && (
                      <span className="text-xs font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-1 rounded-full">
                        {t("payment.active")}
                      </span>
                    )}
                    {formData.defaultGateway !== "STRIPE" && planTier !== "FREE" && (
                      <button
                        type="button"
                        onClick={() => handleSetDefaultGateway("STRIPE")}
                        className="text-xs font-medium text-violet-600 dark:text-violet-400 underline hover:text-violet-800 dark:hover:text-violet-200 transition-colors"
                      >
                        Set as default
                      </button>
                    )}
                  </div>
                </div>

                {/* Indian user informational note */}
                {isIndian && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40">
                    <Globe className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-sky-700 dark:text-sky-400">
                      {t("payment.stripe.indianInfo")}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">{t("payment.stripe.publishableKeyLabel")}</Label>
                    <Input
                      id="stripe-publishable-key"
                      disabled={planTier === "FREE"}
                      value={formData.stripePublishableKey}
                      onChange={e => setFormData({...formData, stripePublishableKey: e.target.value})}
                      placeholder={t("payment.stripe.publishableKeyPlaceholder")}
                      className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("payment.stripe.publishableKeyHint")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">{t("payment.stripe.secretKeyLabel")}</Label>
                    <StripeSecretInput />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("payment.secretHint")}</p>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* TEAM COLLABORATION → link to dedicated Team & Access page */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center flex-shrink-0 border border-indigo-200 dark:border-indigo-900/40">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={cn(typography.sectionHeader, "text-base flex items-center gap-2")}>
                    Team &amp; Access Management
                  </h3>
                  <p className={cn(typography.bodyCopy, "mt-0.5")}>
                    Invite members, assign business roles, manage seats, view access activity, and review governance readiness.
                  </p>
                </div>
                <a
                  href="/settings/team"
                  className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm shadow-indigo-600/20"
                >
                  <Users className="w-4 h-4" />
                  Manage Team
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </CardContent>
          </Card>


          <PWASettings />

          {/* ─── WORKSPACE MODULES ─────────────────────────────────────── */}
          <div ref={workspaceModulesAnchorRef} id="workspace-modules" className="scroll-mt-24" aria-hidden />
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="pb-2">
              <CardTitle className={cn(typography.sectionHeader, "flex items-center gap-2")}>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20">
                  <Sparkles className="h-3.5 w-3.5 text-teal-500" />
                </div>
                Optional Modules
              </CardTitle>
              <CardDescription className={typography.bodyCopy}>
                Enable or disable optional ERP subsystems. Your data is never deleted when a module is disabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Workforce Module Card */}
              <div className={cn(
                "rounded-xl border-2 p-5 transition-all duration-200",
                workforceEnabled
                  ? "border-teal-500/50 bg-teal-50/30 dark:bg-teal-950/10"
                  : "border-zinc-200 dark:border-zinc-800"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      workforceEnabled ? "bg-teal-500 shadow-lg shadow-teal-500/20" : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                      <Users2 className={cn("h-5 w-5", workforceEnabled ? "text-white" : "text-zinc-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Workforce</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          workforceEnabled
                            ? "border-teal-500/30 text-teal-600 dark:text-teal-400"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                        )}>
                          {workforceEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        Employee directory, attendance tracking, leave management, and HR approvals.
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {["Employee directory & profiles", "Leave requests & approvals", "Daily attendance tracking", "Role-aware HR dashboards"].map((f) => (
                          <p key={f} className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <span className={cn("h-1 w-1 rounded-full shrink-0", workforceEnabled ? "bg-teal-500" : "bg-zinc-400")} />
                            {f}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Switch
                    id="workforce-module-toggle"
                    checked={workforceEnabled}
                    disabled={workforceLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisableConfirm(true);
                        return;
                      }
                      setWorkforceLoading(true);
                      try {
                        const res = await fetch('/api/workspace/modules', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ moduleKey: 'WORKFORCE', enabled: true }),
                        });
                        if (res.ok) {
                          setWorkforceEnabled(true);
                          toast.success('Workforce module enabled');
                        } else {
                          toast.error('Failed to enable module');
                        }
                      } finally {
                        setWorkforceLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-teal-500 shrink-0 mt-1"
                  />
                </div>
              </div>

              {/* Payroll Module Card */}
              <div className={cn(
                "rounded-xl border-2 p-5 transition-all duration-200",
                payrollEnabled
                  ? "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10"
                  : "border-zinc-200 dark:border-zinc-800"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      payrollEnabled ? "bg-emerald-600 shadow-lg shadow-emerald-500/20" : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                      <Landmark className={cn("h-5 w-5", payrollEnabled ? "text-white" : "text-zinc-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Payroll</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          payrollEnabled
                            ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                        )}>
                          {payrollEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          Standalone
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        Payroll runs, posting, liabilities, compliance exports, and labor-cost analytics with ERP-native controls.
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {[
                          "Payroll runs with period-level controls",
                          "Payroll posting to ERP ledgers",
                          "Liability tracking and settlement workflows",
                          "Compliance-ready payroll exports",
                          "Labor-cost analytics by team and period",
                        ].map((f) => (
                          <p key={f} className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <span className={cn("h-1 w-1 rounded-full shrink-0", payrollEnabled ? "bg-emerald-600" : "bg-zinc-400")} />
                            {f}
                          </p>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Workforce is optional and improves payroll input quality.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="payroll-module-toggle"
                    checked={payrollEnabled}
                    disabled={payrollLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisablePayrollConfirm(true);
                        return;
                      }
                      setPayrollLoading(true);
                      try {
                        const res = await fetch('/api/workspace/modules', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ moduleKey: 'PAYROLL', enabled: true }),
                        });
                        if (res.ok) {
                          setPayrollEnabled(true);
                          toast.success('Payroll module enabled');
                        } else {
                          toast.error('Failed to enable module');
                        }
                      } finally {
                        setPayrollLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-emerald-600 shrink-0 mt-1"
                  />
                </div>
              </div>

              {/* Revenue Pipeline module card */}
              <div className={cn(
                "rounded-xl border-2 p-5 transition-all duration-200",
                revenuePipelineEnabled
                  ? "border-violet-500/50 bg-violet-50/30 dark:bg-violet-950/10"
                  : "border-zinc-200 dark:border-zinc-800"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      revenuePipelineEnabled ? "bg-violet-600 shadow-lg shadow-violet-500/20" : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                      <Target className={cn("h-5 w-5", revenuePipelineEnabled ? "text-white" : "text-zinc-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Revenue Pipeline</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          revenuePipelineEnabled
                            ? "border-violet-500/30 text-violet-600 dark:text-violet-400"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                        )}>
                          {revenuePipelineEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        Pipeline intelligence for proposals with stalled-deal detection, stage summaries, and next-best-action workflows.
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {[
                          "Proposal pipeline overview by stage",
                          "Accepted-but-unconverted tracking",
                          "Converted-but-unpaid risk visibility",
                          "Action task generation for follow-ups",
                        ].map((f) => (
                          <p key={f} className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <span className={cn("h-1 w-1 rounded-full shrink-0", revenuePipelineEnabled ? "bg-violet-600" : "bg-zinc-400")} />
                            {f}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Switch
                    id="revenue-pipeline-module-toggle"
                    checked={revenuePipelineEnabled}
                    disabled={revenuePipelineLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisableRevenuePipelineConfirm(true);
                        return;
                      }
                      setRevenuePipelineLoading(true);
                      try {
                        const res = await fetch('/api/workspace/modules', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ moduleKey: 'REVENUE_PIPELINE', enabled: true }),
                        });
                        if (res.ok) {
                          setRevenuePipelineEnabled(true);
                          toast.success('Revenue Pipeline module enabled');
                        } else {
                          toast.error('Failed to enable module');
                        }
                      } finally {
                        setRevenuePipelineLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-violet-600 shrink-0 mt-1"
                  />
                </div>
              </div>

              {/* Document Vault module card */}
              <div className={cn(
                "rounded-xl border-2 p-5 transition-all duration-200",
                documentsEnabled
                  ? "border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/10"
                  : "border-zinc-200 dark:border-zinc-800"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      documentsEnabled ? "bg-indigo-600 shadow-lg shadow-indigo-500/20" : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                      <FileText className={cn("h-5 w-5", documentsEnabled ? "text-white" : "text-zinc-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Document Vault</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          documentsEnabled
                            ? "border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                        )}>
                          {documentsEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        Secure document storage with OCR ingestion, extracted-field review, and ERP-native record linking for accounting and compliance.
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {[
                          "Upload Center (Inbox) with triage states",
                          "OCR extraction with review & correction",
                          "Link documents to expenses, invoices, and more",
                          "Archive without deletion (audit preserved)",
                          "Storage usage meter with plan-based limits",
                        ].map((f) => (
                          <p key={f} className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <span className={cn("h-1 w-1 rounded-full shrink-0", documentsEnabled ? "bg-indigo-600" : "bg-zinc-400")} />
                            {f}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Switch
                    id="documents-module-toggle"
                    checked={documentsEnabled}
                    disabled={documentsLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisableDocumentsConfirm(true);
                        return;
                      }
                      setDocumentsLoading(true);
                      try {
                        const res = await fetch('/api/workspace/modules', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ moduleKey: 'DOCUMENTS', enabled: true }),
                        });
                        if (res.ok) {
                          setDocumentsEnabled(true);
                          toast.success('Document Vault module enabled');
                        } else {
                          toast.error('Failed to enable module');
                        }
                      } finally {
                        setDocumentsLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-indigo-600 shrink-0 mt-1"
                  />
                </div>
              </div>

              {/* Cash Flow module card */}
              <div className={cn(
                "rounded-xl border-2 p-5 transition-all duration-200",
                cashFlowEnabled
                  ? "border-cyan-500/50 bg-cyan-50/30 dark:bg-cyan-950/10"
                  : "border-zinc-200 dark:border-zinc-800"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      cashFlowEnabled ? "bg-cyan-600 shadow-lg shadow-cyan-500/20" : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                      <HandCoins className={cn("h-5 w-5", cashFlowEnabled ? "text-white" : "text-zinc-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Cash Flow</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          cashFlowEnabled
                            ? "border-cyan-500/30 text-cyan-600 dark:text-cyan-400"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                        )}>
                          {cashFlowEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        Forecast cash positions, scenario outcomes, risk alerts, and variance drivers for proactive liquidity planning.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="cash-flow-module-toggle"
                    checked={cashFlowEnabled}
                    disabled={cashFlowLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisableCashFlowConfirm(true);
                        return;
                      }
                      setCashFlowLoading(true);
                      try {
                        const res = await fetch('/api/workspace/modules', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ moduleKey: 'CASH_FLOW', enabled: true }),
                        });
                        if (res.ok) {
                          setCashFlowEnabled(true);
                          toast.success('Cash Flow module enabled');
                        } else {
                          toast.error('Failed to enable module');
                        }
                      } finally {
                        setCashFlowLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-cyan-600 shrink-0 mt-1"
                  />
                </div>
              </div>

              {/* Reporting Center module card */}
              <div
                className={cn(
                  "rounded-xl border-2 p-5 transition-all duration-200",
                  reportingCenterEnabled
                    ? "border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10"
                    : "border-zinc-200 dark:border-zinc-800",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                        reportingCenterEnabled
                          ? "bg-amber-600 shadow-lg shadow-amber-500/20"
                          : "bg-zinc-100 dark:bg-zinc-800",
                      )}
                    >
                      <ChartColumnBig
                        className={cn("h-5 w-5", reportingCenterEnabled ? "text-white" : "text-zinc-500")}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {t("module_reporting.title")}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold uppercase",
                            reportingCenterEnabled
                              ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-500",
                          )}
                        >
                          {reportingCenterEnabled
                            ? t("module_reporting.enabled_badge")
                            : t("module_reporting.disabled_badge")}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        {t("module_reporting.description")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="reporting-center-module-toggle"
                    checked={reportingCenterEnabled}
                    disabled={reportingCenterLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisableReportingCenterConfirm(true);
                        return;
                      }
                      setReportingCenterLoading(true);
                      try {
                        const res = await fetch("/api/workspace/modules", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ moduleKey: "REPORTING_CENTER", enabled: true }),
                        });
                        if (res.ok) {
                          setReportingCenterEnabled(true);
                          toast.success(t("module_reporting.toast_enabled"));
                        } else {
                          toast.error(t("module_reporting.toast_enable_failed"));
                        }
                      } finally {
                        setReportingCenterLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-amber-600 shrink-0 mt-1"
                  />
                </div>
              </div>

              {/* AR Aging + Collections module card */}
              <div className={cn(
                "rounded-xl border-2 p-5 transition-all duration-200",
                arCollectionsEnabled
                  ? "border-orange-500/50 bg-orange-50/30 dark:bg-orange-950/10"
                  : "border-zinc-200 dark:border-zinc-800"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      arCollectionsEnabled ? "bg-orange-600 shadow-lg shadow-orange-500/20" : "bg-zinc-100 dark:bg-zinc-800"
                    )}>
                      <Siren className={cn("h-5 w-5", arCollectionsEnabled ? "text-white" : "text-zinc-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">AR Aging + Collections Centre</p>
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          arCollectionsEnabled
                            ? "border-orange-500/30 text-orange-600 dark:text-orange-400"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                        )}>
                          {arCollectionsEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 max-w-sm">
                        Aging buckets, overdue queue, reminder automation, and collection prioritization for receivables recovery.
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {[
                          "Aging buckets and overdue list",
                          "Collection priority queue",
                          "Reminder automation runner",
                          "Follow-up status lifecycle",
                        ].map((f) => (
                          <p key={f} className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <span className={cn("h-1 w-1 rounded-full shrink-0", arCollectionsEnabled ? "bg-orange-600" : "bg-zinc-400")} />
                            {f}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Switch
                    id="ar-collections-module-toggle"
                    checked={arCollectionsEnabled}
                    disabled={arCollectionsLoading}
                    onCheckedChange={async (checked) => {
                      if (!checked) {
                        setShowDisableArCollectionsConfirm(true);
                        return;
                      }
                      setArCollectionsLoading(true);
                      try {
                        const res = await fetch('/api/workspace/modules', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ moduleKey: 'AR_COLLECTIONS', enabled: true }),
                        });
                        if (res.ok) {
                          setArCollectionsEnabled(true);
                          toast.success('AR Collections module enabled');
                        } else {
                          toast.error('Failed to enable module');
                        }
                      } finally {
                        setArCollectionsLoading(false);
                      }
                    }}
                    className="data-[state=checked]:bg-orange-600 shrink-0 mt-1"
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                More modules (Time Tracking, Asset Management) coming soon.
              </p>
            </CardContent>
          </Card>

          {/* Disable Workforce Confirmation Dialog */}
          <Dialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Disable Workforce?
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Your employee data, attendance records, and leave history will be <strong className="text-zinc-200">preserved</strong>.
                  Workforce will be hidden from navigation and the dashboard until re-enabled.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowDisableConfirm(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  id="confirm-disable-workforce"
                  disabled={workforceLoading}
                  onClick={async () => {
                    setWorkforceLoading(true);
                    try {
                      const res = await fetch('/api/workspace/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ moduleKey: 'WORKFORCE', enabled: false }),
                      });
                      if (res.ok) {
                        setWorkforceEnabled(false);
                        setShowDisableConfirm(false);
                        toast.success('Workforce module disabled');
                      } else {
                        toast.error('Failed to disable module');
                      }
                    } finally {
                      setWorkforceLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {workforceLoading ? 'Disabling...' : 'Disable Workforce'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Disable Payroll Confirmation Dialog */}
          <Dialog open={showDisablePayrollConfirm} onOpenChange={setShowDisablePayrollConfirm}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Disable Payroll?
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Payroll runs, postings, and liability history will be <strong className="text-zinc-200">preserved</strong>.
                  Payroll will be hidden from navigation and route access until re-enabled.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowDisablePayrollConfirm(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  id="confirm-disable-payroll"
                  disabled={payrollLoading}
                  onClick={async () => {
                    setPayrollLoading(true);
                    try {
                      const res = await fetch('/api/workspace/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ moduleKey: 'PAYROLL', enabled: false }),
                      });
                      if (res.ok) {
                        setPayrollEnabled(false);
                        setShowDisablePayrollConfirm(false);
                        toast.success('Payroll module disabled');
                      } else {
                        toast.error('Failed to disable module');
                      }
                    } finally {
                      setPayrollLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {payrollLoading ? 'Disabling...' : 'Disable Payroll'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Disable Document Vault Confirmation Dialog */}
          <Dialog open={showDisableRevenuePipelineConfirm} onOpenChange={setShowDisableRevenuePipelineConfirm}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Disable Revenue Pipeline?
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Your proposal and quote data remain fully available in <strong className="text-zinc-200">/proposals</strong>.
                  Revenue Pipeline views and automation will be hidden until re-enabled.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowDisableRevenuePipelineConfirm(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  id="confirm-disable-revenue-pipeline"
                  disabled={revenuePipelineLoading}
                  onClick={async () => {
                    setRevenuePipelineLoading(true);
                    try {
                      const res = await fetch('/api/workspace/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ moduleKey: 'REVENUE_PIPELINE', enabled: false }),
                      });
                      if (res.ok) {
                        setRevenuePipelineEnabled(false);
                        setShowDisableRevenuePipelineConfirm(false);
                        toast.success('Revenue Pipeline module disabled');
                      } else {
                        toast.error('Failed to disable module');
                      }
                    } finally {
                      setRevenuePipelineLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {revenuePipelineLoading ? 'Disabling...' : 'Disable Revenue Pipeline'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Disable Document Vault Confirmation Dialog */}
          <Dialog open={showDisableDocumentsConfirm} onOpenChange={setShowDisableDocumentsConfirm}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Disable Document Vault?
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Your uploaded documents, OCR jobs, and links will be <strong className="text-zinc-200">preserved</strong>.
                  Document Vault will be hidden from navigation until re-enabled.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowDisableDocumentsConfirm(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  id="confirm-disable-documents"
                  disabled={documentsLoading}
                  onClick={async () => {
                    setDocumentsLoading(true);
                    try {
                      const res = await fetch('/api/workspace/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ moduleKey: 'DOCUMENTS', enabled: false }),
                      });
                      if (res.ok) {
                        setDocumentsEnabled(false);
                        setShowDisableDocumentsConfirm(false);
                        toast.success('Document Vault module disabled');
                      } else {
                        toast.error('Failed to disable module');
                      }
                    } finally {
                      setDocumentsLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {documentsLoading ? 'Disabling...' : 'Disable Document Vault'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Disable Cash Flow Confirmation Dialog */}
          <Dialog open={showDisableCashFlowConfirm} onOpenChange={setShowDisableCashFlowConfirm}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Disable Cash Flow?
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Forecast snapshots, alerts, assumptions, and plans will be <strong className="text-zinc-200">preserved</strong>.
                  Cash Flow will be hidden from navigation and route access until re-enabled.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowDisableCashFlowConfirm(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  id="confirm-disable-cash-flow"
                  disabled={cashFlowLoading}
                  onClick={async () => {
                    setCashFlowLoading(true);
                    try {
                      const res = await fetch('/api/workspace/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ moduleKey: 'CASH_FLOW', enabled: false }),
                      });
                      if (res.ok) {
                        setCashFlowEnabled(false);
                        setShowDisableCashFlowConfirm(false);
                        toast.success('Cash Flow module disabled');
                      } else {
                        toast.error('Failed to disable module');
                      }
                    } finally {
                      setCashFlowLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {cashFlowLoading ? 'Disabling...' : 'Disable Cash Flow'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={showDisableReportingCenterConfirm}
            onOpenChange={setShowDisableReportingCenterConfirm}
          >
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> {t("module_reporting.disable_title")}
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  {t("module_reporting.disable_body")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowDisableReportingCenterConfirm(false)}
                  className="text-zinc-400"
                >
                  {t("module_reporting.cancel")}
                </Button>
                <Button
                  id="confirm-disable-reporting-center"
                  disabled={reportingCenterLoading}
                  onClick={async () => {
                    setReportingCenterLoading(true);
                    try {
                      const res = await fetch("/api/workspace/modules", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ moduleKey: "REPORTING_CENTER", enabled: false }),
                      });
                      if (res.ok) {
                        setReportingCenterEnabled(false);
                        setShowDisableReportingCenterConfirm(false);
                        toast.success(t("module_reporting.toast_disabled"));
                      } else {
                        toast.error(t("module_reporting.toast_disable_failed"));
                      }
                    } finally {
                      setReportingCenterLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {reportingCenterLoading
                    ? t("module_reporting.disable_loading")
                    : t("module_reporting.disable_confirm")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Disable AR Collections Confirmation Dialog */}
          <Dialog open={showDisableArCollectionsConfirm} onOpenChange={setShowDisableArCollectionsConfirm}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
              <DialogHeader>
                <DialogTitle className="text-zinc-50 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" /> Disable AR Collections?
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Aging buckets, follow-up statuses, and reminder history will be <strong className="text-zinc-200">preserved</strong>.
                  AR Collections will be hidden from navigation and route access until re-enabled.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowDisableArCollectionsConfirm(false)} className="text-zinc-400">Cancel</Button>
                <Button
                  id="confirm-disable-ar-collections"
                  disabled={arCollectionsLoading}
                  onClick={async () => {
                    setArCollectionsLoading(true);
                    try {
                      const res = await fetch('/api/workspace/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ moduleKey: 'AR_COLLECTIONS', enabled: false }),
                      });
                      if (res.ok) {
                        setArCollectionsEnabled(false);
                        setShowDisableArCollectionsConfirm(false);
                        toast.success('AR Collections module disabled');
                      } else {
                        toast.error('Failed to disable module');
                      }
                    } finally {
                      setArCollectionsLoading(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white border-none"
                >
                  {arCollectionsLoading ? 'Disabling...' : 'Disable AR Collections'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* STICKY SAVE FOOTER */}
          <div className="sticky bottom-6 z-30">
            <FormSubmitBar
              isSubmitting={isSubmitting}
              submitText={t('save_button')}
              submittingText={t("actions.saving")}
              helperText={successMsg ? (
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                  <CheckCircle2 className="w-4 h-4" /> {t("profile_saved")}
                </span>
              ) : t("description")}
              className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-2xl shadow-2xl transition-all duration-300 hover:border-indigo-500/30"
            />
            <FormFieldMessages helpText={isSubmitting ? t("actions.saving") : undefined} className="px-2 pt-2" />
          </div>

        </form>
    </DashboardPageShell>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Building2, Landmark, ShieldCheck, Image as ImageIcon, CheckCircle2,
  Save, Mailbox, Bot, Trash2, CreditCard, Lock, Globe, AlertTriangle,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function SettingsWizard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
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
    existingLogoUrl: "", defaultSacCode: "998313",
    // Razorpay (PRO only — INR / Indian users)
    razorpayKeyId: "", razorpayKeySecret: "",
    // Stripe (PRO only — global)
    stripePublishableKey: "", stripeSecretKey: "",
    // Gateway preference
    defaultGateway: "RAZORPAY",
  });

  const [planTier, setPlanTier] = useState<string>("FREE");
  
  const t = useTranslations('Settings');
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const isIndian = countryCode === "IN";

  useEffect(() => {
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
            defaultSacCode: data.defaultSacCode || "998313",
            // Razorpay: server returns "SET" if secret is configured
            razorpayKeyId:     data.razorpayKeyId     || "",
            razorpayKeySecret: data.razorpayKeySecret || "",
            // Stripe: server returns "SET" if secret is configured
            stripePublishableKey: data.stripePublishableKey || "",
            stripeSecretKey:      data.stripeSecretKey      || "",
            defaultGateway: gateway,
          });
        }
      })
      .catch(err => {
        console.error("Failed to load settings:", err);
        toast.error("Failed to load generic settings profile");
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
          toast.info("Settings form auto-filled by AI. Click Save to confirm.");
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch(e) { 
        console.error("Failed to parse AI payload"); 
        toast.warning("AI auto-fill failed. Please fill the form manually.");
      }
    }
  }, []);

  const handleGatewayTabChange = (tab: "RAZORPAY" | "STRIPE") => {
    setActiveGatewayTab(tab);
    setFormData(prev => ({ ...prev, defaultGateway: tab }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMsg(false);
    const toastId = toast.loading("Saving configuration...");

    const body = new FormData();
    Object.entries(formData).forEach(([key, val]) => {
      if (val !== "" && val !== null && val !== undefined) {
        body.append(key, String(val));
      }
    });
    
    if (logoFile) body.append('logo', logoFile);

    try {
      const res = await fetch('/api/settings', { method: 'POST', body });
      if (res.ok) {
        setSuccessMsg(true);
        setIsNewSetup(false);
        toast.success("Master profile updated securely.", { id: toastId });
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
        toast.error("Failed to save configuration.", { id: toastId });
      }
    } catch (err) {
      toast.error("A network error occurred.", { id: toastId });
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
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Secret Configured</span>
          </div>
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE"}
            onClick={() => setFormData({ ...formData, stripeSecretKey: "" })}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          >Change</Button>
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
          placeholder="sk_live_••••••••••••••••••••"
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
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Secret Configured</span>
          </div>
          <Button
            type="button" variant="outline"
            disabled={planTier === "FREE" || !isIndian}
            onClick={() => setFormData({ ...formData, razorpayKeySecret: "" })}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          >Change</Button>
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
            <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Secret Configured</span>
          </div>
          <Button
            type="button" variant="outline"
            onClick={() => setFormData({ ...formData, groqApiKey: "" })}
            className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
          >Change</Button>
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
          placeholder="gsk_••••••••••••••••••••"
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="sticky top-0 z-30 -mx-4 px-4 py-6 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300 text-center space-y-2 mb-10">
          <div className="mx-auto w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 mb-4 transition-transform hover:scale-105">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {isNewSetup ? "Welcome to your ERP" : t('title')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto text-sm font-medium">
            {isNewSetup 
              ? "Let's set up your master profile. This data will be used to automatically generate your invoices." 
              : t('description')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* IDENTITY & BRANDING */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <Building2 className="w-5 h-5 text-indigo-600" /> {t('identity_title')}
              </CardTitle>
              <CardDescription className="dark:text-zinc-400">{t('identity_description')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('company_name')} <span className="text-red-500">*</span></Label>
                  <Input required value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} placeholder="e.g., BabaBuilds" className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('proprietor_name')} <span className="text-red-500">*</span></Label>
                  <Input required value={formData.proprietorName} onChange={e => setFormData({...formData, proprietorName: e.target.value})} placeholder="e.g., Sameer Siddiqui" className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('full_address')} <span className="text-red-500">*</span></Label>
                <Input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="C-28, Ganesh Colony..." className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-medium" />
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
                  <Input value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} placeholder="https://" className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
              </div>

              {/* INVOICE THEME SELECTOR */}
              <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                <Label className="dark:text-zinc-300 text-base">{t('invoice_theme')}</Label>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{t('invoice_theme_desc')}</p>
                
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
                      <option value="en-IN">English (India)</option>
                      <option value="ar">العربية (Arabic)</option>
                      <option value="es">Español (Spanish)</option>
                      <option value="hi">हिंदी (Hindi)</option>
                    </select>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('language_description')}</p>
                  </div>
                </div>
              </div>
              
              <Separator className="dark:bg-zinc-800" />

              <div className="space-y-2">
                <Label className="flex items-center gap-2 dark:text-zinc-300"><ImageIcon className="w-4 h-4" /> {t('master_logo')}</Label>
                <div className="flex items-center gap-6">
                  {formData.existingLogoUrl && !logoFile && (
                    <img src={formData.existingLogoUrl} alt="Current Logo" className="h-12 object-contain bg-white dark:bg-zinc-200 border rounded p-1" />
                  )}
                  <div className="flex-1">
                    <Input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] || null)} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('logo_hint')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* COMPLIANCE & TAX */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <ShieldCheck className="w-5 h-5 text-emerald-600" /> {t('compliance_title')}
              </CardTitle>
              <CardDescription className="dark:text-zinc-400">{t('compliance_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('pan_number')} <span className="text-red-500">*</span></Label>
                <Input required className="h-10 uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold tracking-widest" value={formData.panNumber} onChange={e => setFormData({...formData, panNumber: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('udyam_reg')}</Label>
                <Input className="h-10 uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold tracking-widest" value={formData.udyamNumber} onChange={e => setFormData({...formData, udyamNumber: e.target.value.toUpperCase()})} placeholder="UDYAM-RJ-..." />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('gstin')}</Label>
                <Input className="h-10 uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold tracking-widest" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">Default SAC/HSN Code <span className="text-red-500">*</span></Label>
                <Input required className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" value={formData.defaultSacCode} onChange={e => setFormData({...formData, defaultSacCode: e.target.value})} placeholder="e.g. 998313" />
                <p className="text-xs text-zinc-400">Used as fallback if individual invoice code is blank.</p>
              </div>
            </CardContent>

          </Card>

          {/* BANKING DETAILS */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <Landmark className="w-5 h-5 text-amber-600" /> {t('banking_title')}
              </CardTitle>
              <CardDescription className="dark:text-zinc-400">{t('banking_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('bank_name')} <span className="text-red-500">*</span></Label>
                <Input required value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} placeholder="e.g., ICICI Bank" className="h-10 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold" />
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
                <Label className="dark:text-zinc-300">{t('ifsc_code')} <span className="text-red-500">*</span></Label>
                <Input required className="uppercase dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" value={formData.ifscCode} onChange={e => setFormData({...formData, ifscCode: e.target.value.toUpperCase()})} />
              </div>
            </CardContent>
          </Card>

          {/* EMAIL SERVER (SMTP) */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <Mailbox className="w-5 h-5 text-blue-600" /> {t('smtp_title')}
              </CardTitle>
              <CardDescription className="dark:text-zinc-400">{t('smtp_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3 space-y-2">
                  <Label className="dark:text-zinc-300">{t('smtp_host')}</Label>
                  <Input value={formData.smtpHost} onChange={e => setFormData({...formData, smtpHost: e.target.value})} placeholder="e.g., smtp.gmail.com" className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('smtp_port')}</Label>
                  <Input type="number" value={formData.smtpPort} onChange={e => setFormData({...formData, smtpPort: e.target.value})} placeholder="465" className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
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
                <Input type="email" value={formData.smtpFromEmail} onChange={e => setFormData({...formData, smtpFromEmail: e.target.value})} placeholder="billing@bababuilds.com" className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
              </div>
            </CardContent>
          </Card>

          {/* AI ASSISTANT CONFIGURATION */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <Bot className="w-5 h-5 text-purple-600" /> {t('ai_config_title')}
              </CardTitle>
              <CardDescription className="dark:text-zinc-400">{t('ai_config_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label className="dark:text-zinc-300">{t('groq_api_key')}</Label>
                <GroqSecretInput />
              </div>
            </CardContent>
          </Card>

          {/* ── PAYMENT GATEWAY INTEGRATION ──────────────────────────────────────── */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative overflow-hidden">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
              <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
                <CreditCard className="w-5 h-5 text-emerald-600" /> Payment Gateway Integration
              </CardTitle>
              <CardDescription className="dark:text-zinc-400">
                Connect a payment gateway to automatically embed a secure payment link in every invoice PDF.
                {!isIndian && (
                  <span className="ml-1 text-violet-600 dark:text-violet-400 font-medium">
                    Stripe is recommended for your region.
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
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">PRO Feature</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Upgrade to PRO to connect Razorpay or Stripe and let clients pay directly from the invoice PDF.
                    </p>
                  </div>
                </div>
              )}

              {/* DEFAULT GATEWAY SELECTOR — segmented control */}
              <div className={`space-y-3 ${planTier === "FREE" ? "opacity-50 pointer-events-none select-none" : ""}`}>
                <Label className="dark:text-zinc-300 text-sm font-semibold">Default Payment Gateway</Label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  This gateway will be used to generate the payment link on every new invoice.
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
                    {!isIndian && <span className="text-xs font-normal opacity-70">(IN only)</span>}
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
                    <Globe className="w-4 h-4" /> Stripe
                    <span className="text-xs font-normal opacity-70">(Global)</span>
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
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Razorpay</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">INR payments only · Indian businesses</p>
                    </div>
                  </div>
                  {activeGatewayTab === "RAZORPAY" && (
                    <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full">ACTIVE</span>
                  )}
                </div>

                {/* Non-Indian warning */}
                {!isIndian && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/40">
                    <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-orange-700 dark:text-orange-400">
                      <span className="font-semibold">Not available for your region.</span> Razorpay only supports Indian businesses and INR payments. Use Stripe for global payment collection.
                    </p>
                  </div>
                )}

                <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${!isIndian ? "opacity-40 pointer-events-none select-none" : ""}`}>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">Razorpay Key ID</Label>
                    <Input
                      id="razorpay-key-id"
                      disabled={planTier === "FREE" || !isIndian}
                      value={formData.razorpayKeyId}
                      onChange={e => setFormData({...formData, razorpayKeyId: e.target.value})}
                      placeholder="rzp_live_xxxxxxxxxxxx"
                      className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Your publishable Razorpay Key ID. Safe to store.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">Razorpay Key Secret</Label>
                    <RazorpaySecretInput />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Encrypted with AES-256-GCM before storage. Never visible after saving.</p>
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
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Stripe</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">135+ currencies · Global businesses</p>
                    </div>
                  </div>
                  {activeGatewayTab === "STRIPE" && (
                    <span className="text-xs font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-1 rounded-full">ACTIVE</span>
                  )}
                </div>

                {/* Indian user informational note */}
                {isIndian && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40">
                    <Globe className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-sky-700 dark:text-sky-400">
                      Stripe works globally and supports USD, EUR, GBP and 135+ currencies. Useful if you bill international clients.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">Publishable Key</Label>
                    <Input
                      id="stripe-publishable-key"
                      disabled={planTier === "FREE"}
                      value={formData.stripePublishableKey}
                      onChange={e => setFormData({...formData, stripePublishableKey: e.target.value})}
                      placeholder="pk_live_xxxxxxxxxxxx"
                      className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-mono text-sm"
                    />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Your publishable Stripe key. Safe to store.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300 text-sm">Secret Key</Label>
                    <StripeSecretInput />
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">Encrypted with AES-256-GCM before storage. Never visible after saving.</p>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* STICKY SAVE FOOTER */}
          <div className="sticky bottom-6 flex items-center justify-end gap-4 p-4 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-30 transition-all duration-300 group hover:border-indigo-500/30">
            {successMsg && (
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                <CheckCircle2 className="w-4 h-4" /> Profile Saved!
              </span>
            )}
            <Button type="submit" size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[200px] font-bold uppercase tracking-widest text-xs h-12 shadow-lg shadow-indigo-500/20 transition-all active:scale-95 border-none" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> {t('save_button')}</>
              )}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
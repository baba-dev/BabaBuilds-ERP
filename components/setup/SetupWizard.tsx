"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { 
  Globe, ShieldCheck, Building2, 
  ArrowRight, ArrowLeft, CheckCircle2, Sparkles,
  Zap, Wallet, Users2, Calendar, Clock, ClipboardList, FileText, Route, CheckSquare2, HandCoins, Target, Siren, ChartColumnBig
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GEOGRAPHY_DB } from "@/lib/geography";
import { getSetupStepNameKey } from "@/components/setup/step-indicator";

interface SetupWizardProps {
  isModal?: boolean;
  onComplete?: () => void;
}

type PayrollReadinessResponse = {
  executionPhases: Array<{ id: string; title: string; summary: string }>;
  readiness: {
    score: number;
    postingEnabled: boolean;
    postingStatusLabel: string;
    checklist: Array<{ id: string; label: string; status: "pass" | "warn"; detail: string }>;
  };
};

export default function SetupWizard({ isModal = false, onComplete }: SetupWizardProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations('Setup');
  const [wizardMode, setWizardMode] = useState<"quick" | "full">(isModal ? "quick" : "full");
  const lastStep = wizardMode === "quick" ? 3 : 7;
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form State
  const [form, setForm] = useState({
    countryCode: "IN",
    baseCurrency: "INR",
    locale: "en-IN",
    taxLabel: "GST",
    taxIdLabel: "GSTIN",
    routingLabel: "IFSC Code",
    companyName: "",
    proprietorName: "",
    email: "",
    address: "",
    smtpHost: "",
    smtpPort: 465,
    smtpUser: "",
    smtpPassword: "",
    smtpFromEmail: "",
    groqApiKey: "",
    defaultGateway: "RAZORPAY",
    razorpayKeyId: "",
    razorpayKeySecret: "",
    stripePublishableKey: "",
    stripeSecretKey: "",
    shopEnabled: false,
    shopSlug: "",
    shopTagline: "",
    shopAccentColor: "#6366f1",
    enableWorkforce: false,
    enableDocuments: false,
    enableRevenuePipeline: false,
    enablePayroll: false,
    enableCashFlow: false,
    enableArCollections: false,
    enableReportingCenter: false,
    payrollSetupPath: "STANDALONE" as "STANDALONE" | "WORKFORCE_LINKED",
  });
  const [payrollReadiness, setPayrollReadiness] = useState<PayrollReadinessResponse | null>(null);
  const essentialCompletionCount = useMemo(() => {
    const essentials = [form.companyName, form.proprietorName, form.email, form.address];
    return essentials.filter((value) => value.trim().length > 0).length;
  }, [form.address, form.companyName, form.email, form.proprietorName]);
  const essentialCompletionPercent = Math.round((essentialCompletionCount / 4) * 100);

  useEffect(() => {
    const email = session?.user?.email;
    const name = session?.user?.name;
    if (!email && !name) return;
    setForm((prev) => ({
      ...prev,
      email: prev.email || email || "",
      proprietorName: prev.proprietorName || name || "",
      companyName: prev.companyName || (name ? `${name.split(" ")[0]} Business` : prev.companyName),
    }));
  }, [session?.user?.email, session?.user?.name]);

  // Smart Suggestion Logic
  const handleCountryChange = (code: string) => {
    const geo = GEOGRAPHY_DB[code];
    if (geo) {
      setForm({
        ...form,
        countryCode: code,
        baseCurrency: geo.currency,
        locale: geo.locale,
        taxLabel: geo.taxLabel,
        taxIdLabel: geo.taxIdLabel,
        routingLabel: geo.routingLabel
      });
    } else {
      setForm({ ...form, countryCode: code });
    }

    setFieldErrors(prev => {
      const next = { ...prev };
      delete next.countryCode;
      return next;
    });
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, lastStep));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  useEffect(() => {
    if (step !== 7) return;
    let active = true;

    const loadPayrollReadiness = async () => {
      try {
        const res = await fetch("/api/payroll/onboarding/readiness", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json()) as PayrollReadinessResponse;
        if (active) setPayrollReadiness(payload);
      } catch {
        // Non-blocking by design: wizard should still be usable without readiness telemetry.
      }
    };

    loadPayrollReadiness();
    return () => {
      active = false;
    };
  }, [step]);

  const finishSetup = async () => {
    setIsSubmitting(true);
    setFieldErrors({});
    const toastId = toast.loading("Configuring your global workspace...");

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (res.ok) {
        toast.success("Welcome to your new HQ!", { id: toastId });
        
        // Logic Branch: Modal vs Standalone
        if (isModal && onComplete) {
          onComplete(); // This triggers update() in the Gatekeeper
        } else {
          router.push("/dashboard?firstLook=1"); // Redirect to canonical dashboard entry path with first-look context
        }
      } else {
        const errorBody = await res.json().catch(() => null);
        if (errorBody?.code === "VALIDATION_ERROR" && errorBody?.fieldErrors) {
          setFieldErrors(errorBody.fieldErrors as Record<string, string>);
          toast.error(errorBody.error || "Please fix the highlighted fields.", { id: toastId });
        } else {
          toast.error(errorBody?.error || "Setup failed. Please check your fields.", { id: toastId });
        }
      }
    } catch {
      toast.error("Network error during setup.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center transition-colors duration-500 ${isModal ? 'bg-transparent p-0' : 'min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8'}`}>
      
      {/* PROGRESS TRACKER */}
      <div className="max-w-md w-full mb-8 space-y-4">
        <div className="flex justify-between items-center px-2">
          {Array.from({ length: lastStep }, (_, i) => i + 1).map((i) => (
            <div key={i} className={`h-1.5 flex-1 mx-1 rounded-full transition-all duration-500 ${step >= i ? "bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.4)]" : "bg-zinc-200 dark:bg-zinc-800"}`} />
          ))}
        </div>
        <p className="text-center text-xs uppercase font-black tracking-widest text-zinc-400 dark:text-zinc-600">
          {t('step_indicator', {
            current: step,
            total: lastStep,
            name: t(getSetupStepNameKey(step))
          })}
        </p>
        <div className="rounded-xl border border-indigo-200/60 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-200">
          <p className="font-bold uppercase tracking-wider">Why this matters</p>
          <p className="mt-1 leading-relaxed">
            Essential setup completion: {essentialCompletionPercent}% ({essentialCompletionCount}/4)
            {" "}core identity fields complete. Accurate identity and remittance details improve invoice trust and reduce failed collections.
          </p>
        </div>
      </div>

      <div className="max-w-xl w-full relative">
        {/* DECORATIVE ELEMENTS (Only show in standalone) */}
        {!isModal && (
          <>
            <div className="absolute -top-12 -left-12 w-24 h-24 bg-indigo-500/10 blur-3xl rounded-full animate-pulse" />
            <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-emerald-500/10 blur-3xl rounded-full animate-pulse delay-700" />
          </>
        )}

        <Card className={`shadow-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden ${isModal ? 'border-none' : ''}`}>
          
          {/* STEP 1: GEOGRAPHY */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Globe className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step1_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step1_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                <div className="space-y-3">
                  <Label className="dark:text-zinc-300">{t('select_country')}</Label>
                  <Select value={form.countryCode} onValueChange={handleCountryChange}>
                    <SelectTrigger className="h-12 text-lg dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100">
                      <SelectValue placeholder={t('search_countries')} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                      {Object.keys(GEOGRAPHY_DB).map(code => (
                        <SelectItem key={code} value={code} className="dark:text-zinc-100">{GEOGRAPHY_DB[code].country}</SelectItem>
                      ))}
                      <SelectItem value="OTHER" className="dark:text-zinc-100">{t('other_international')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.countryCode && <p className="text-xs text-red-500">{fieldErrors.countryCode}</p>}
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {t('geo_hint')}
                  </p>
                </div>
              </CardContent>
            </div>
          )}

          {/* STEP 2: FINANCIAL FOUNDATION */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Wallet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step2_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step2_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('base_currency')}</Label>
                    <Input
                      value={form.baseCurrency}
                      onChange={e => {
                        setForm({...form, baseCurrency: e.target.value.toUpperCase()});
                        setFieldErrors(prev => {
                          const next = { ...prev };
                          delete next.baseCurrency;
                          return next;
                        });
                      }}
                      className="h-12 font-bold dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
                    />
                    {fieldErrors.baseCurrency && <p className="text-xs text-red-500">{fieldErrors.baseCurrency}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('number_system')}</Label>
                    <div className="h-12 flex items-center px-4 bg-zinc-50 dark:bg-zinc-950 rounded-md border dark:border-zinc-800 text-sm dark:text-zinc-400">
                      {form.countryCode === "IN" ? "1,00,000.00" : "1,000,000.00"}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-center text-zinc-400 dark:text-zinc-500">{t('format_hint')}</p>
                {fieldErrors.locale && <p className="text-xs text-center text-red-500">{fieldErrors.locale}</p>}
              </CardContent>
            </div>
          )}

          {/* STEP 3: COMPLIANCE */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step3_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step3_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-4">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('sales_tax_name')}</Label>
                  <Input value={form.taxLabel} onChange={e => setForm({...form, taxLabel: e.target.value})} placeholder={t('ph_sales_tax')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('tax_id_label')}</Label>
                  <Input value={form.taxIdLabel} onChange={e => setForm({...form, taxIdLabel: e.target.value})} placeholder={t('ph_tax_id')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('bank_routing_label')}</Label>
                  <Input value={form.routingLabel} onChange={e => setForm({...form, routingLabel: e.target.value})} placeholder={t('ph_routing')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                </div>
              </CardContent>
            </div>
          )}

          {/* STEP 4: IDENTITY */}
          {wizardMode === "full" && step === 4 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Building2 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step4_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step4_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-4">
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-left dark:border-amber-900/50 dark:bg-amber-900/20">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                    Essential setup progress
                  </p>
                  <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                    Complete these fields to activate professional invoices and smoother onboarding completion.
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-900/60">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${essentialCompletionPercent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {essentialCompletionCount}/4 completed
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('legal_company_name')}</Label>
                  <Input value={form.companyName} onChange={e => {
                    setForm({...form, companyName: e.target.value});
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.companyName;
                      return next;
                    });
                  }} placeholder={t('ph_company')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                  {fieldErrors.companyName && <p className="text-xs text-red-500">{fieldErrors.companyName}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('founder_name')}</Label>
                    <Input value={form.proprietorName} onChange={e => {
                      setForm({...form, proprietorName: e.target.value});
                      setFieldErrors(prev => {
                        const next = { ...prev };
                        delete next.proprietorName;
                        return next;
                      });
                    }} placeholder={t('ph_founder')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                    {fieldErrors.proprietorName && <p className="text-xs text-red-500">{fieldErrors.proprietorName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('email')}</Label>
                    <Input type="email" value={form.email} onChange={e => {
                      setForm({...form, email: e.target.value});
                      setFieldErrors(prev => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                    }} placeholder="billing@acme.com" className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                    {fieldErrors.email && <p className="text-xs text-red-500">{fieldErrors.email}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300">{t('billing_address')}</Label>
                  <Input value={form.address} onChange={e => {
                    setForm({...form, address: e.target.value});
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.address;
                      return next;
                    });
                  }} placeholder={t('ph_address')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                  {fieldErrors.address && <p className="text-xs text-red-500">{fieldErrors.address}</p>}
                </div>
              </CardContent>
            </div>
          )}

          {/* STEP 5: INTEGRATIONS */}
          {wizardMode === "full" && step === 5 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step5_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step5_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 dark:text-zinc-300">
                      {t('api_groq_label')}
                      <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">{t('groq_link_text')}</a>
                    </Label>
                    <Input value={form.groqApiKey} onChange={e => setForm({...form, groqApiKey: e.target.value})} placeholder={t('api_groq_ph')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('api_groq_tooltip')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="dark:text-zinc-300">{t('gateway_label')}</Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-2 mb-2">{t('payment_tooltip')}</p>
                  <Select value={form.defaultGateway} onValueChange={val => setForm({...form, defaultGateway: val})}>
                    <SelectTrigger className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                      <SelectItem value="RAZORPAY">{t('razorpay_label')}</SelectItem>
                      <SelectItem value="STRIPE">{t('stripe_label')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.defaultGateway === 'RAZORPAY' ? (
                    <div className="grid grid-cols-2 gap-4 p-4 border rounded-md dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                       <div className="col-span-2 flex justify-end"><a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">{t('razorpay_link_text')}</a></div>
                       <Input value={form.razorpayKeyId} onChange={e => setForm({...form, razorpayKeyId: e.target.value})} placeholder="Key ID" className="dark:bg-zinc-950" />
                       <Input type="password" value={form.razorpayKeySecret} onChange={e => setForm({...form, razorpayKeySecret: e.target.value})} placeholder="Key Secret" className="dark:bg-zinc-950" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 p-4 border rounded-md dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                       <div className="col-span-2 flex justify-end"><a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">{t('stripe_link_text')}</a></div>
                       <Input value={form.stripePublishableKey} onChange={e => setForm({...form, stripePublishableKey: e.target.value})} placeholder="Publishable Key" className="dark:bg-zinc-950" />
                       <Input type="password" value={form.stripeSecretKey} onChange={e => setForm({...form, stripeSecretKey: e.target.value})} placeholder="Secret Key" className="dark:bg-zinc-950" />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Label className="dark:text-zinc-300">SMTP Email Server (Optional)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Input value={form.smtpHost} onChange={e => setForm({...form, smtpHost: e.target.value})} placeholder={t('smtp_ph_host')} className="dark:bg-zinc-950" />
                    <Input type="number" value={form.smtpPort} onChange={e => setForm({...form, smtpPort: parseInt(e.target.value) || 465})} placeholder="465" className="dark:bg-zinc-950" />
                    <Input value={form.smtpUser} onChange={e => setForm({...form, smtpUser: e.target.value})} placeholder="User" className="dark:bg-zinc-950" />
                    <Input type="password" value={form.smtpPassword} onChange={e => setForm({...form, smtpPassword: e.target.value})} placeholder="Password" className="dark:bg-zinc-950" />
                    <Input value={form.smtpFromEmail} onChange={e => setForm({...form, smtpFromEmail: e.target.value})} placeholder="from@acme.com" className="col-span-2 dark:bg-zinc-950" />
                  </div>
                </div>

              </CardContent>
            </div>
          )}

          {/* STEP 6: STORE / SHOP */}
          {wizardMode === "full" && step === 6 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-xl flex items-center justify-center mb-4">
                   <Globe className="w-6 h-6 text-pink-600 dark:text-pink-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step6_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step6_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                 <div className="flex items-center justify-between p-4 border rounded-xl dark:border-zinc-800">
                   <Label className="text-base font-bold dark:text-zinc-200">{t('enable_shop')}</Label>
                   <div className="flex items-center gap-2">
                     <input type="checkbox" checked={form.shopEnabled} onChange={e => setForm({...form, shopEnabled: e.target.checked})} className="w-5 h-5 accent-indigo-600" />
                   </div>
                 </div>
                 {form.shopEnabled && (
                   <div className="space-y-4 animate-in fade-in zoom-in-95">
                     <div className="space-y-2">
                       <Label className="dark:text-zinc-300">{t('shop_slug')}</Label>
                       <div className="flex items-center gap-2">
                         <span className="text-zinc-500 text-sm">https://erp.com/store/</span>
                         <Input value={form.shopSlug} onChange={e => setForm({...form, shopSlug: e.target.value})} placeholder={t('shop_slug_ph')} className="flex-1 dark:bg-zinc-950" />
                       </div>
                     </div>
                     <div className="space-y-2">
                       <Label className="dark:text-zinc-300">{t('shop_tagline')}</Label>
                       <Input value={form.shopTagline} onChange={e => setForm({...form, shopTagline: e.target.value})} placeholder="Welcome to our store!" className="dark:bg-zinc-950" />
                     </div>
                     <div className="space-y-2">
                       <Label className="dark:text-zinc-300">{t('shop_color')}</Label>
                       <Input type="color" value={form.shopAccentColor} onChange={e => setForm({...form, shopAccentColor: e.target.value})} className="w-full h-12 p-1 dark:bg-zinc-950" />
                     </div>
                   </div>
                 )}
              </CardContent>
            </div>
          )}

          {/* STEP 7: MODULE SELECTION */}
          {wizardMode === "full" && step === 7 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Users2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">Optional Modules</CardTitle>
                <CardDescription className="dark:text-zinc-400">
                  Enable powerful subsystems for your workspace. You can change these anytime from Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-4">
                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enableWorkforce
                      ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enableWorkforce: !form.enableWorkforce })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableWorkforce ? 'bg-teal-500 shadow-lg shadow-teal-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Users2 className={`h-5 w-5 ${form.enableWorkforce ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Workforce</p>
                          {form.enableWorkforce && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 dark:bg-teal-900/40 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          HR, attendance, leave management &amp; approvals — integrated with your ERP.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {[
                            { icon: Users2, text: 'Employee directory & profiles' },
                            { icon: Calendar, text: 'Leave requests & approvals' },
                            { icon: ClipboardList, text: 'Daily attendance tracking' },
                            { icon: Sparkles, text: 'Role-aware HR dashboards' },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableWorkforce ? 'text-teal-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enableWorkforce ? 'bg-teal-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableWorkforce ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enableDocuments
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enableDocuments: !form.enableDocuments })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableDocuments ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <FileText className={`h-5 w-5 ${form.enableDocuments ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Document Vault</p>
                          {form.enableDocuments && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Secure storage with OCR, extracted-field review, and ERP-native linking for accounting &amp; compliance.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {[
                            { icon: FileText, text: 'Upload Center (Inbox) with triage states' },
                            { icon: Sparkles, text: 'OCR extraction with review & correction' },
                            { icon: ShieldCheck, text: 'Compliance evidence vault & reminders' },
                            { icon: Zap, text: 'Suggested linking to expenses & invoices' },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableDocuments ? 'text-indigo-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enableDocuments ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableDocuments ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enableCashFlow
                      ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enableCashFlow: !form.enableCashFlow })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableCashFlow ? 'bg-cyan-600 shadow-lg shadow-cyan-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <HandCoins className={`h-5 w-5 ${form.enableCashFlow ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Cash Flow</p>
                          {form.enableCashFlow && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-900/40 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Forecast cash runways, monitor crunch windows, and refresh scenarios before risks become urgent.
                        </p>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enableCashFlow ? 'bg-cyan-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableCashFlow ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enableArCollections
                      ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enableArCollections: !form.enableArCollections })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableArCollections ? 'bg-orange-600 shadow-lg shadow-orange-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Siren className={`h-5 w-5 ${form.enableArCollections ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">AR Aging + Collections Centre</p>
                          {form.enableArCollections && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Manage receivables with aging buckets, overdue prioritization, reminder automation, and collector workflow statuses.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {[
                            { icon: Clock, text: 'Aging buckets and overdue concentration' },
                            { icon: ClipboardList, text: 'Collection priority queue by score' },
                            { icon: Zap, text: 'Reminder automation for overdue invoices' },
                            { icon: Route, text: 'Follow-up lifecycle and escalations' },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableArCollections ? 'text-orange-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enableArCollections ? 'bg-orange-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableArCollections ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>


                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enableReportingCenter
                      ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enableReportingCenter: !form.enableReportingCenter })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableReportingCenter ? 'bg-amber-600 shadow-lg shadow-amber-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <ChartColumnBig className={`h-5 w-5 ${form.enableReportingCenter ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('optional_reporting_title')}</p>
                          {form.enableReportingCenter && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('optional_reporting_desc')}</p>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enableReportingCenter ? 'bg-amber-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableReportingCenter ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>

                <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 pt-2">
                  More modules (Time Tracking, Asset Registry) coming soon.
                </p>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enableRevenuePipeline
                      ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enableRevenuePipeline: !form.enableRevenuePipeline })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableRevenuePipeline ? 'bg-violet-600 shadow-lg shadow-violet-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Target className={`h-5 w-5 ${form.enableRevenuePipeline ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Revenue Pipeline</p>
                          {form.enableRevenuePipeline && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Proposal-stage intelligence with stalled-deal alerts and guided follow-up actions to accelerate conversions.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {[
                            { icon: Target, text: 'Pipeline overview by stage' },
                            { icon: Clock, text: 'Stalled opportunity detection' },
                            { icon: Route, text: 'Next-best-action recommendations' },
                            { icon: ClipboardList, text: 'Batch task creation for follow-ups' },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableRevenuePipeline ? 'text-violet-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enableRevenuePipeline ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableRevenuePipeline ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 cursor-pointer ${
                    form.enablePayroll
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                  onClick={() => setForm({ ...form, enablePayroll: !form.enablePayroll })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enablePayroll ? 'bg-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Wallet className={`h-5 w-5 ${form.enablePayroll ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Payroll (Execution staged)</p>
                          {form.enablePayroll && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                          Stand up payroll safely with phased rollout controls, read-only previews, and go-live readiness checks.
                        </p>

                        <div className="space-y-2 mb-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Execution phases</p>
                          <div className="space-y-1.5">
                            {(payrollReadiness?.executionPhases ?? []).map((phase) => (
                              <div key={phase.id} className="flex items-start gap-2">
                                <Route className="h-3 w-3 shrink-0 mt-0.5 text-emerald-500" />
                                <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                                  <span className="font-semibold">{phase.title}:</span> {phase.summary}
                                </p>
                              </div>
                            ))}
                            {!payrollReadiness?.executionPhases?.length && (
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Load payroll phases after module selection.</p>
                            )}
                          </div>
                        </div>

                        {form.enablePayroll && (
                          <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/60 bg-white/80 dark:bg-zinc-950/60 p-3 space-y-3 animate-in fade-in zoom-in-95">
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Setup path</p>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {[
                                  {
                                    key: "STANDALONE" as const,
                                    title: "Standalone payroll setup",
                                    desc: "Configure payroll independently from Workforce.",
                                  },
                                  {
                                    key: "WORKFORCE_LINKED" as const,
                                    title: "Workforce-linked setup",
                                    desc: "Derive payroll context from Workforce employees + attendance.",
                                  },
                                ].map((option) => (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setForm({ ...form, payrollSetupPath: option.key });
                                    }}
                                    className={`text-left rounded-lg border px-3 py-2 transition ${
                                      form.payrollSetupPath === option.key
                                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                                    }`}
                                  >
                                    <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">{option.title}</p>
                                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{option.desc}</p>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Go-live readiness checklist</p>
                              <div className="space-y-1.5">
                                {(payrollReadiness?.readiness.checklist ?? []).map((item) => (
                                  <div key={item.id} className="flex items-start gap-2">
                                    <CheckSquare2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${item.status === "pass" ? "text-emerald-500" : "text-amber-500"}`} />
                                    <div>
                                      <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">{item.label}</p>
                                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{item.detail}</p>
                                    </div>
                                  </div>
                                ))}
                                {payrollReadiness && (
                                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 pt-1">
                                    Readiness score: <span className="font-semibold">{payrollReadiness.readiness.score}%</span> · Posting:{" "}
                                    <span className="font-semibold">{payrollReadiness.readiness.postingStatusLabel}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      form.enablePayroll ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enablePayroll ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </div>
          )}

          <CardFooter className="bg-zinc-50 dark:bg-zinc-950/50 p-6 border-t dark:border-zinc-800 flex justify-between gap-4">
            <Button 
              variant="ghost" 
              onClick={prevStep} 
              disabled={step === 1 || isSubmitting}
              className="dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> {t('back')}
            </Button>
            
            {step < lastStep ? (
              <Button onClick={nextStep} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]">
                {t('continue')} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                <Button onClick={finishSetup} disabled={isSubmitting || !form.companyName} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px] shadow-lg shadow-emerald-500/20 border-none">
                  {isSubmitting ? t('finalizing') : <><CheckCircle2 className="w-4 h-4 mr-2" /> {t('launch_erp')}</>}
                </Button>
                {wizardMode === "quick" && (
                  <button
                    type="button"
                    onClick={() => {
                      setWizardMode("full");
                      setStep(4);
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  >
                    Advanced setup (integrations, shop, modules)
                  </button>
                )}
              </div>
            )}
          </CardFooter>
        </Card>
      </div>

      {!isModal && (
        <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-600 flex items-center gap-2">
          <Sparkles className="w-3 h-3" /> {t('secure_config')}
        </p>
      )}
    </div>
  );
}

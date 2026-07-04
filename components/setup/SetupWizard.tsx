"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Globe, ShieldCheck, Building2, 
  ArrowRight, ArrowLeft, CheckCircle2, Sparkles,
  Zap, Wallet, Users2, Calendar, Clock, ClipboardList, FileText, Route, CheckSquare2, HandCoins, Target, Siren, ChartColumnBig, ChevronDown, ShoppingCart
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
  const lastStep = wizardMode === "quick" ? 3 : 6;
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [expandedCapabilities, setExpandedCapabilities] = useState<Record<string, boolean>>({});
  const [showMoreModules, setShowMoreModules] = useState(false);
  const companyNameInputRef = useRef<HTMLInputElement>(null);

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
    enablePos: true,
    payrollSetupPath: "STANDALONE" as "STANDALONE" | "WORKFORCE_LINKED",
  });
  const [payrollReadiness, setPayrollReadiness] = useState<PayrollReadinessResponse | null>(null);
  const [moduleAnnouncement, setModuleAnnouncement] = useState("");
  const essentialCompletionCount = useMemo(() => {
    const essentials = [form.companyName, form.proprietorName, form.email, form.address];
    return essentials.filter((value) => value.trim().length > 0).length;
  }, [form.address, form.companyName, form.email, form.proprietorName]);
  const essentialCompletionPercent = Math.round((essentialCompletionCount / 4) * 100);
  const hasAnyModuleEnabled = useMemo(
    () =>
      [
        form.enableWorkforce,
        form.enableDocuments,
        form.enableCashFlow,
        form.enableArCollections,
        form.enableReportingCenter,
        form.enableRevenuePipeline,
        form.enablePayroll,
      ].some(Boolean),
    [
      form.enableArCollections,
      form.enableCashFlow,
      form.enableDocuments,
      form.enablePayroll,
      form.enableReportingCenter,
      form.enableRevenuePipeline,
      form.enableWorkforce,
    ],
  );
  const hasPersonaSignal = useMemo(() => {
    const user = session?.user as Record<string, unknown> | undefined;
    return Boolean(user?.persona || user?.workspaceType || user?.businessType || user?.industry);
  }, [session?.user]);
  const companyNameMissing = form.companyName.trim().length === 0;

  const jumpToCompanyNameField = () => {
    if (wizardMode === "quick") {
      setWizardMode("full");
    }
    setStep(4);
    window.requestAnimationFrame(() => {
      companyNameInputRef.current?.focus();
      companyNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

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

  useEffect(() => {
    const user = session?.user as Record<string, unknown> | undefined;
    const rawPersona = (user?.persona || user?.workspaceType || user?.businessType || user?.industry || "") as string;
    const persona = rawPersona.toLowerCase();
    if (!persona) return;

    setForm((prev) => {
      if (
        prev.enableWorkforce ||
        prev.enableDocuments ||
        prev.enableCashFlow ||
        prev.enableArCollections ||
        prev.enableReportingCenter ||
        prev.enableRevenuePipeline ||
        prev.enablePayroll
      ) {
        return prev;
      }
      const next = { ...prev };
      if (persona.includes("agency") || persona.includes("service") || persona.includes("consult")) {
        next.enableDocuments = true;
        next.enableRevenuePipeline = true;
      } else if (persona.includes("retail") || persona.includes("ecommerce") || persona.includes("store")) {
        next.enableCashFlow = true;
        next.enableArCollections = true;
      } else if (persona.includes("team") || persona.includes("hr") || persona.includes("staff")) {
        next.enableWorkforce = true;
        next.enableDocuments = true;
      } else {
        next.enableDocuments = true;
        next.enableCashFlow = true;
      }
      return next;
    });
  }, [session]);

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
    if (step !== 6) return;
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


  const toggleModule = (field: "enableWorkforce" | "enableDocuments" | "enableCashFlow" | "enableArCollections" | "enableReportingCenter" | "enableRevenuePipeline" | "enablePayroll" | "shopEnabled" | "enablePos", label: string) => {
    setForm((prev) => {
      const nextValue = !prev[field];
      setModuleAnnouncement(`${label} ${nextValue ? "enabled" : "disabled"}`);
      return { ...prev, [field]: nextValue };
    });
  };

  const finishSetup = async (isSkip = false) => {
    setIsSubmitting(true);
    setFieldErrors({});
    const toastId = toast.loading(isSkip ? "Skipping setup for now..." : "Configuring your global workspace...");

    try {
      const payload = { ...form, isSkip };
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
          
          const errors = errorBody.fieldErrors;
          let targetStep = step;
          if (errors.countryCode) targetStep = 1;
          else if (errors.baseCurrency || errors.locale) targetStep = 2;
          else if (errors.taxLabel || errors.taxIdLabel || errors.routingLabel) targetStep = 3;
          else if (errors.companyName || errors.proprietorName || errors.email || errors.address) {
            setWizardMode("full");
            targetStep = 4;
          }

          if (targetStep !== step || (targetStep === 4 && wizardMode === "quick")) {
             setStep(targetStep);
             toast.error("Please fill in the required fields on this step.", { id: toastId });
          } else {
             toast.error(errorBody.error || "Please fix the highlighted fields.", { id: toastId });
          }
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
    <div className={`flex flex-col items-center justify-center transition-colors duration-500 ${isModal ? "bg-transparent p-0 w-full h-full min-h-0" : "min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8"}`}>
      {/* PROGRESS TRACKER */}
      <div
        className={`max-w-md w-full space-y-4 ${
          isModal
            ? "sticky top-0 z-20 mb-0 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950"
            : "mb-8"
        }`}
      >
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

      <div className={`max-w-xl w-full relative ${isModal ? "flex flex-col flex-1 min-h-0 h-full w-full md:min-h-[70vh]" : ""}`}>
        {/* DECORATIVE ELEMENTS (Only show in standalone) */}
        {!isModal && (
          <>
            <div className="absolute -top-12 -left-12 w-24 h-24 bg-indigo-500/10 blur-3xl rounded-full animate-pulse" />
            <div className="absolute -bottom-12 -right-12 w-24 h-24 bg-emerald-500/10 blur-3xl rounded-full animate-pulse delay-700" />
          </>
        )}

        <Card
          className={`shadow-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden ${
            isModal ? "flex min-h-0 flex-1 flex-col border-none shadow-none" : ""
          }`}
        >
          <div className={isModal ? "min-h-0 flex-1 overflow-y-auto pb-24" : ""}>
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
                <p className="sr-only" aria-live="polite">{moduleAnnouncement}</p>
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
                  <Input ref={companyNameInputRef} value={form.companyName} onChange={e => {
                    setForm({...form, companyName: e.target.value});
                    setFieldErrors(prev => {
                      const next = { ...prev };
                      delete next.companyName;
                      return next;
                    });
                  }} placeholder={t('ph_company')} className="h-12 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                  {fieldErrors.companyName && <p className="text-xs text-red-500">{fieldErrors.companyName}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-md dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                       <div className="col-span-1 sm:col-span-2 flex justify-end"><a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">{t('razorpay_link_text')}</a></div>
                       <Input value={form.razorpayKeyId} onChange={e => setForm({...form, razorpayKeyId: e.target.value})} placeholder="Key ID" className="dark:bg-zinc-950" />
                       <Input type="password" value={form.razorpayKeySecret} onChange={e => setForm({...form, razorpayKeySecret: e.target.value})} placeholder="Key Secret" className="dark:bg-zinc-950" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-md dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                       <div className="col-span-1 sm:col-span-2 flex justify-end"><a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline">{t('stripe_link_text')}</a></div>
                       <Input value={form.stripePublishableKey} onChange={e => setForm({...form, stripePublishableKey: e.target.value})} placeholder="Publishable Key" className="dark:bg-zinc-950" />
                       <Input type="password" value={form.stripeSecretKey} onChange={e => setForm({...form, stripeSecretKey: e.target.value})} placeholder="Secret Key" className="dark:bg-zinc-950" />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Label className="dark:text-zinc-300">{t('smtp_title_optional')}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input value={form.smtpHost} onChange={e => setForm({...form, smtpHost: e.target.value})} placeholder={t('smtp_ph_host')} className="dark:bg-zinc-950" />
                    <Input type="number" value={form.smtpPort} onChange={e => setForm({...form, smtpPort: parseInt(e.target.value) || 465})} placeholder="465" className="dark:bg-zinc-950" />
                    <Input value={form.smtpUser} onChange={e => setForm({...form, smtpUser: e.target.value})} placeholder={t('smtp_ph_user')} className="dark:bg-zinc-950" />
                    <Input type="password" value={form.smtpPassword} onChange={e => setForm({...form, smtpPassword: e.target.value})} placeholder={t('smtp_ph_pass')} className="dark:bg-zinc-950" />
                    <Input value={form.smtpFromEmail} onChange={e => setForm({...form, smtpFromEmail: e.target.value})} placeholder={t('smtp_ph_from')} className="col-span-1 sm:col-span-2 dark:bg-zinc-950" />
                  </div>
                </div>

              </CardContent>
            </div>
          )}

          {/* STEP 6: MODULE SELECTION */}
          {wizardMode === "full" && step === 6 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Users2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('optional_modules_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">
                  {t('optional_modules_desc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-5">
                <div className="rounded-xl border border-teal-200/60 bg-teal-50/70 dark:border-teal-900/40 dark:bg-teal-950/30 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-wider text-teal-800 dark:text-teal-200">{t('recommended_for_teams')}</p>
                  <p className="mt-1 text-xs text-teal-700 dark:text-teal-300">{t('start_lean')}</p>
                </div>
                {!hasPersonaSignal && !hasAnyModuleEnabled && (
                  <p className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {t('no_defaults_detected')}
                  </p>
                )}
                <div
                   className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enableWorkforce
                      ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableWorkforce ? 'bg-teal-500 shadow-lg shadow-teal-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Users2 className={`h-5 w-5 ${form.enableWorkforce ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_workforce_title')}</p>
                          {form.enableWorkforce && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 dark:bg-teal-900/40 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 line-clamp-2">
                          {t('mod_workforce_desc')}
                        </p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedCapabilities((prev) => ({ ...prev, workforce: !prev.workforce })); }} className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 inline-flex items-center gap-1">
                          {expandedCapabilities.workforce ? t('hide_capabilities') : t('see_capabilities')} <ChevronDown className={`h-3 w-3 transition-transform ${expandedCapabilities.workforce ? "rotate-180" : ""}`} />
                        </button>
                        {expandedCapabilities.workforce && <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                          {[
                            { icon: Users2, text: t('mod_workforce_cap1') },
                            { icon: Calendar, text: t('mod_workforce_cap2') },
                            { icon: ClipboardList, text: t('mod_workforce_cap3') },
                            { icon: Sparkles, text: t('mod_workforce_cap4') },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableWorkforce ? 'text-teal-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>}
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enableWorkforce} aria-label="Toggle Workforce module" onClick={() => toggleModule("enableWorkforce", "Workforce module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enableWorkforce ? 'bg-teal-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableWorkforce ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enableDocuments
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableDocuments ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <FileText className={`h-5 w-5 ${form.enableDocuments ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_documents_title')}</p>
                          {form.enableDocuments && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 line-clamp-2">
                          {t('mod_documents_desc')}
                        </p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedCapabilities((prev) => ({ ...prev, documents: !prev.documents })); }} className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1">
                          {expandedCapabilities.documents ? t('hide_capabilities') : t('see_capabilities')} <ChevronDown className={`h-3 w-3 transition-transform ${expandedCapabilities.documents ? "rotate-180" : ""}`} />
                        </button>
                        {expandedCapabilities.documents && <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                          {[
                            { icon: FileText, text: t('mod_documents_cap1') },
                            { icon: Sparkles, text: t('mod_documents_cap2') },
                            { icon: ShieldCheck, text: t('mod_documents_cap3') },
                            { icon: Zap, text: t('mod_documents_cap4') },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableDocuments ? 'text-indigo-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>}
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enableDocuments} aria-label="Toggle Document Vault module" onClick={() => toggleModule("enableDocuments", "Document Vault module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enableDocuments ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableDocuments ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enableCashFlow
                      ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableCashFlow ? 'bg-cyan-600 shadow-lg shadow-cyan-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <HandCoins className={`h-5 w-5 ${form.enableCashFlow ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_cashflow_title')}</p>
                          {form.enableCashFlow && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-900/40 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                          {t('mod_cashflow_desc')}
                        </p>
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enableCashFlow} aria-label="Toggle Cash Flow module" onClick={() => toggleModule("enableCashFlow", "Cash Flow module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enableCashFlow ? 'bg-cyan-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableCashFlow ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.shopEnabled
                      ? 'border-pink-500 bg-pink-50/50 dark:bg-pink-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.shopEnabled ? 'bg-pink-500 shadow-lg shadow-pink-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Globe className={`h-5 w-5 ${form.shopEnabled ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_shop_title')}</p>
                          {form.shopEnabled && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 dark:bg-pink-900/40 px-2 py-0.5 text-[10px] font-bold text-pink-700 dark:text-pink-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">
                          {t('mod_shop_desc')}
                        </p>
                        
                        {form.shopEnabled && (
                          <div className="rounded-xl border border-pink-200/70 dark:border-pink-900/60 bg-white/80 dark:bg-zinc-950/60 p-4 space-y-4 animate-in fade-in zoom-in-95 mt-3">
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold dark:text-zinc-300">{t('shop_slug')}</Label>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-500 text-xs truncate">/store/</span>
                                <Input
                                  value={form.shopSlug}
                                  onChange={e => setForm({...form, shopSlug: e.target.value})}
                                  placeholder={t('shop_slug_ph')}
                                  className="h-9 text-xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold dark:text-zinc-300">{t('shop_tagline')}</Label>
                              <Input
                                value={form.shopTagline}
                                onChange={e => setForm({...form, shopTagline: e.target.value})}
                                placeholder={t('shop_tagline')}
                                className="h-9 text-xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold dark:text-zinc-300">{t('shop_color')}</Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="color"
                                  value={form.shopAccentColor}
                                  onChange={e => setForm({...form, shopAccentColor: e.target.value})}
                                  className="w-12 h-9 p-0.5 border dark:border-zinc-800 cursor-pointer rounded"
                                />
                                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">{form.shopAccentColor}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.shopEnabled}
                      aria-label="Toggle Public Shop module"
                      onClick={() => toggleModule("shopEnabled", "Public Shop module")}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                        form.shopEnabled ? 'bg-pink-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.shopEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                <div className={`rounded-2xl border-2 p-4 transition-all duration-300 ${form.enablePos ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl transition-colors ${form.enablePos ? 'bg-amber-500 shadow-lg shadow-amber-500/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                        <ShoppingCart className={`h-5 w-5 ${form.enablePos ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-zinc-900 dark:text-zinc-100">Point of Sale</h3>
                          {form.enablePos && <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Enabled</span>}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          Add a checkout register for walk-in sales, services, products, invoices, proposals, and retainers. You can disable it later without deleting POS-generated data.
                        </p>
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enablePos} aria-label="Toggle Point of Sale module" onClick={() => toggleModule("enablePos", "Point of Sale module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${form.enablePos ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.enablePos ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <button type="button" onClick={() => setShowMoreModules((prev) => !prev)} className="w-full text-left rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200 inline-flex items-center justify-between">
                  {t('more_modules_btn')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${showMoreModules ? "rotate-180" : ""}`} />
                </button>

                {showMoreModules && <div className="space-y-4">
                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enableArCollections
                      ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableArCollections ? 'bg-orange-600 shadow-lg shadow-orange-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Siren className={`h-5 w-5 ${form.enableArCollections ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_arcollections_title')}</p>
                          {form.enableArCollections && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 line-clamp-2">
                          {t('mod_arcollections_desc')}
                        </p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedCapabilities((prev) => ({ ...prev, arCollections: !prev.arCollections })); }} className="text-[11px] font-semibold text-orange-700 dark:text-orange-300 inline-flex items-center gap-1">
                          {expandedCapabilities.arCollections ? t('hide_capabilities') : t('see_capabilities')} <ChevronDown className={`h-3 w-3 transition-transform ${expandedCapabilities.arCollections ? "rotate-180" : ""}`} />
                        </button>
                        {expandedCapabilities.arCollections && <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                          {[
                            { icon: Clock, text: t('mod_arcollections_cap1') },
                            { icon: ClipboardList, text: t('mod_arcollections_cap2') },
                            { icon: Zap, text: t('mod_arcollections_cap3') },
                            { icon: Route, text: t('mod_arcollections_cap4') },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableArCollections ? 'text-orange-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>}
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enableArCollections} aria-label="Toggle AR Aging + Collections Centre module" onClick={() => toggleModule("enableArCollections", "AR Aging + Collections Centre module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enableArCollections ? 'bg-orange-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableArCollections ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>


                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enableReportingCenter
                      ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
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
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{t('optional_reporting_desc')}</p>
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enableReportingCenter} aria-label="Toggle Reporting Center module" onClick={() => toggleModule("enableReportingCenter", "Reporting Center module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enableReportingCenter ? 'bg-amber-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableReportingCenter ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 pt-2">
                  {t('coming_soon_modules')}
                </p>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enableRevenuePipeline
                      ? 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enableRevenuePipeline ? 'bg-violet-600 shadow-lg shadow-violet-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Target className={`h-5 w-5 ${form.enableRevenuePipeline ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_revenue_title')}</p>
                          {form.enableRevenuePipeline && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/40 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 line-clamp-2">
                          {t('mod_revenue_desc')}
                        </p>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedCapabilities((prev) => ({ ...prev, revenuePipeline: !prev.revenuePipeline })); }} className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 inline-flex items-center gap-1">
                          {expandedCapabilities.revenuePipeline ? t('hide_capabilities') : t('see_capabilities')} <ChevronDown className={`h-3 w-3 transition-transform ${expandedCapabilities.revenuePipeline ? "rotate-180" : ""}`} />
                        </button>
                        {expandedCapabilities.revenuePipeline && <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                          {[
                            { icon: Target, text: t('mod_revenue_cap1') },
                            { icon: Clock, text: t('mod_revenue_cap2') },
                            { icon: Route, text: t('mod_revenue_cap3') },
                            { icon: ClipboardList, text: t('mod_revenue_cap4') },
                          ].map(({ icon: Icon, text }) => (
                            <div key={text} className="flex items-center gap-1.5">
                              <Icon className={`h-3 w-3 shrink-0 ${form.enableRevenuePipeline ? 'text-violet-500' : 'text-zinc-400'}`} />
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{text}</span>
                            </div>
                          ))}
                        </div>}
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enableRevenuePipeline} aria-label="Toggle Revenue Pipeline module" onClick={() => toggleModule("enableRevenuePipeline", "Revenue Pipeline module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enableRevenuePipeline ? 'bg-violet-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enableRevenuePipeline ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

                <div
                  className={`group relative rounded-2xl border-2 p-5 transition-all duration-200 ${
                    form.enablePayroll
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                        form.enablePayroll ? 'bg-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}>
                        <Wallet className={`h-5 w-5 ${form.enablePayroll ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t('mod_payroll_title')}</p>
                          {form.enablePayroll && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-2.5 w-2.5" /> {t('enabled_badge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 line-clamp-2">
                          {t('mod_payroll_desc')}
                        </p>

                        <div className="space-y-2 mb-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('mod_payroll_phases')}</p>
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
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{t('mod_payroll_phase_load')}</p>
                            )}
                          </div>
                        </div>

                        {form.enablePayroll && (
                          <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/60 bg-white/80 dark:bg-zinc-950/60 p-3 space-y-3 animate-in fade-in zoom-in-95">
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('mod_payroll_path')}</p>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {[
                                  {
                                    key: "STANDALONE" as const,
                                    title: t('mod_payroll_path_standalone_title'),
                                    desc: t('mod_payroll_path_standalone_desc'),
                                  },
                                  {
                                    key: "WORKFORCE_LINKED" as const,
                                    title: t('mod_payroll_path_linked_title'),
                                    desc: t('mod_payroll_path_linked_desc'),
                                  },
                                ].map((option) => (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => {
                                      setForm({ ...form, payrollSetupPath: option.key });
                                    }}
                                    className={`text-left rounded-lg border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
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
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('mod_payroll_checklist')}</p>
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
                                    {t('mod_payroll_score', {
                                      score: payrollReadiness.readiness.score,
                                      status: payrollReadiness.readiness.postingStatusLabel
                                    })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button type="button" role="switch" aria-checked={form.enablePayroll} aria-label="Toggle Payroll module" onClick={() => toggleModule("enablePayroll", "Payroll module")} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-zinc-900 ${
                      form.enablePayroll ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.enablePayroll ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
                </div>}
              </CardContent>
            </div>
          )}

          </div>
          <CardFooter
            className={`bg-zinc-50 p-4 sm:p-6 border-t dark:border-zinc-800 flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-4 dark:bg-zinc-950 ${
              isModal ? "sticky bottom-0 z-20" : ""
            }`}
          >
            <div className="flex flex-row sm:flex-row items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
              <Button 
                variant="ghost" 
                onClick={prevStep} 
                disabled={step === 1 || isSubmitting}
                className="dark:text-zinc-400 dark:hover:bg-zinc-900 flex-1 sm:flex-none"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> {t('back')}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20 text-xs font-semibold px-3 h-9 rounded-md transition-colors flex-1 sm:flex-none"
              >
                Sign Out
              </Button>
            </div>
            
            {step < lastStep ? (
              <Button onClick={nextStep} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px] w-full sm:w-auto">
                {t('continue')} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <div className="flex flex-col items-stretch sm:items-end gap-3 w-full sm:w-auto">
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
                  <Button variant="ghost" type="button" onClick={() => finishSetup(true)} disabled={isSubmitting} className="text-zinc-500 dark:text-zinc-400 w-full sm:w-auto mt-2 sm:mt-0">
                    {t('skip_for_now')}
                  </Button>
                  <Button
                    onClick={() => finishSetup(false)}
                    disabled={isSubmitting || companyNameMissing}
                    title={companyNameMissing ? t('company_name_required') : undefined}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px] shadow-lg shadow-emerald-500/20 border-none w-full sm:w-auto"
                  >
                    {isSubmitting ? t('finalizing') : <><CheckCircle2 className="w-4 h-4 mr-2" /> {t('launch_erp')}</>}
                  </Button>
                </div>
                {companyNameMissing && (
                  <div className="text-center sm:text-right space-y-1">
                    <p className="text-xs text-amber-700 dark:text-amber-300">{t('company_name_required')}</p>
                    <button
                      type="button"
                      onClick={jumpToCompanyNameField}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                      {t('jump_to_required')}
                    </button>
                  </div>
                )}
                {wizardMode === "quick" && (
                  <button
                     type="button"
                     onClick={() => {
                       setWizardMode("full");
                       setStep(4);
                     }}
                     className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 text-center sm:text-right mt-1"
                  >
                    {t('advanced_setup_btn')}
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

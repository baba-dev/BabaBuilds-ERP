"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { 
  Globe, Landmark, ShieldCheck, Building2, 
  ArrowRight, ArrowLeft, CheckCircle2, Sparkles,
  Zap, Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GEOGRAPHY_DB } from "@/lib/geography";

interface SetupWizardProps {
  isModal?: boolean;
  onComplete?: () => void;
}

export default function SetupWizard({ isModal = false, onComplete }: SetupWizardProps) {
  const router = useRouter();
  const t = useTranslations('Setup');
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
    address: ""
  });

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

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

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
          router.push("/dashboard"); // Redirect to canonical dashboard entry path
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
    } catch (err) {
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
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-1.5 flex-1 mx-1 rounded-full transition-all duration-500 ${step >= i ? "bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.4)]" : "bg-zinc-200 dark:bg-zinc-800"}`} />
          ))}
        </div>
        <p className="text-center text-xs uppercase font-black tracking-widest text-zinc-400 dark:text-zinc-600">
          {t('step_indicator', { 
            current: step, 
            name: step === 1 ? t('step_geo') : step === 2 ? t('step_finance') : step === 3 ? t('step_compliance') : t('step_identity')
          })}
        </p>
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
          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <CardHeader className="text-center pb-8 border-b dark:border-zinc-800">
                <div className="mx-auto w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-4">
                  <Building2 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle className="text-2xl font-black dark:text-zinc-50">{t('step4_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('step4_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-8 space-y-4">
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

          <CardFooter className="bg-zinc-50 dark:bg-zinc-950/50 p-6 border-t dark:border-zinc-800 flex justify-between gap-4">
            <Button 
              variant="ghost" 
              onClick={prevStep} 
              disabled={step === 1 || isSubmitting}
              className="dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> {t('back')}
            </Button>
            
            {step < 4 ? (
              <Button onClick={nextStep} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]">
                {t('continue')} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={finishSetup} disabled={isSubmitting || !form.companyName} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px] shadow-lg shadow-emerald-500/20 border-none">
                {isSubmitting ? t('finalizing') : <><CheckCircle2 className="w-4 h-4 mr-2" /> {t('launch_erp')}</>}
              </Button>
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

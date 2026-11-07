"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Lock, Unlock, ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations, useLocale } from "next-intl";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

const LOCALIZED_COPY = {
  en: {
    badge: "Feature Directory",
    title: "Free Sandbox vs. Active Operations",
    description: "A transparent, honest guide to our service limits. Use the Free tier to validate your templates and workflows, and upgrade to Pro or Team when you need seamless automation and borderless collections.",
    colFeature: "Feature & Capabilities",
    colFree: "Free Sandbox",
    colPro: "Pro & Team Operations",
    insideSandbox: "Inside the sandbox:",
    offerBadge: "High-Value Trial Offer",
    offerTitle: "Evaluate full automation risk-free for 15 days",
    offerText: "Join thousands of businesses billing effortlessly. Set up Stripe or Razorpay gateways, sync retainers, and chat with AI BabaBot instantly. No credit card is required, and you can switch back to the Free plan anytime.",
    btnTrial: "Start 15-Day Pro Trial",
    btnFree: "Create Free Sandbox",
    badgeCancel: "Cancel or change plans anytime",
    badgeSafe: "Safe SSL / AES-256 Encryption",
    badgeGst: "GST / VAT Tax Compliant",
    freeCaps: {
      invoices: "5 invoices",
      clients: "Up to 3 clients",
      payments: "Manual Transfers",
      retainers: "Manual billing",
      team: "Solo account",
      storage: "0 MB storage",
      bot: "Not included",
      tax: "Basic classification"
    },
    proCaps: {
      invoices: "Unlimited Volume",
      clients: "Unlimited Clients",
      payments: "Stripe & Razorpay",
      retainers: "100% Automated",
      team: "Up to 15 seats",
      storage: "Up to 50 MB storage",
      bot: "Unlimited copilot",
      tax: "Auto-tax calculation"
    }
  },
  es: {
    badge: "Directorio de Funciones",
    title: "Sandbox Gratis vs. Operaciones Activas",
    description: "Una guía transparente y honesta sobre los límites de nuestro servicio. Utiliza el nivel Gratuito para validar tus plantillas y flujos de trabajo, y actualízate a Pro o Team cuando necesites automatización fluida y cobros sin fronteras.",
    colFeature: "Función y Capacidades",
    colFree: "Sandbox Gratis",
    colPro: "Operaciones Pro y Team",
    insideSandbox: "Dentro de la sandbox:",
    offerBadge: "Oferta de prueba de gran valor",
    offerTitle: "Evalúa la automatización completa sin riesgos durante 15 días",
    offerText: "Únete a miles de empresas que facturan sin esfuerzo. Configura pasarelas de pago Stripe o Razorpay, sincroniza contratos de retención y chatea con AI BabaBot al instante. No se requiere tarjeta de crédito y puedes volver al plan gratuito en cualquier momento.",
    btnTrial: "Iniciar prueba Pro de 15 días",
    btnFree: "Crear Sandbox Gratis",
    badgeCancel: "Cancela o cambia de plan en cualquier momento",
    badgeSafe: "Cifrado seguro SSL / AES-256",
    badgeGst: "Cumple con impuestos GST / IVA",
    freeCaps: {
      invoices: "5 facturas",
      clients: "Hasta 3 clientes",
      payments: "Transferencias manuales",
      retainers: "Facturación manual",
      team: "Cuenta de usuario único",
      storage: "0 MB de almacenamiento",
      bot: "No incluido",
      tax: "Clasificación básica"
    },
    proCaps: {
      invoices: "Volumen ilimitado",
      clients: "Clientes ilimitados",
      payments: "Stripe y Razorpay",
      retainers: "100% Automatizado",
      team: "Hasta 15 asientos",
      storage: "Hasta 50 MB",
      bot: "Copiloto ilimitado",
      tax: "Cálculo fiscal automático"
    }
  },
  hi: {
    badge: "सुविधा निर्देशिका",
    title: "मुफ़्त सैंडबॉक्स बनाम सक्रिय संचालन",
    description: "हमारी सेवा सीमाओं के लिए एक पारदर्शी, ईमानدار मार्गदर्शिका। अपने टेम्प्लेट और वर्कफ़्लो को मान्य करने के लिए मुफ़्त टियर का उपयोग करें, और जब आपको निर्बाध स्वचालन और वैश्विक भुगतान संग्रह की आवश्यकता हो तो प्रो या टीम में अपग्रेड करें।",
    colFeature: "सुविधा और क्षमताएं",
    colFree: "मुफ़्त सैंडबॉक्स",
    colPro: "प्रो और टीम संचालन",
    insideSandbox: "सैंडबॉक्स के अंदर:",
    offerBadge: "उच्च मूल्य परीक्षण प्रस्ताव",
    offerTitle: "15 दिनों के लिए जोखिम-मुक्त पूर्ण स्वचालन का मूल्यांकन करें",
    offerText: "बिना किसी प्रयास के बिलिंग करने वाले हजारों व्यवसायों में शामिल हों। तुरंत स्ट्राइप या रेज़रपे गेटवे सेट करें, रिटेनर सिंक करें, और AI BabaBot के साथ चैट करें। किसी क्रेडिट कार्ड की आवश्यकता नहीं है, और आप किसी भी समय मुफ़्त योजना पर वापस जा सकते हैं।",
    btnTrial: "15-दिवसीय प्रो परीक्षण शुरू करें",
    btnFree: "मुफ़्त सैंडबॉक्स बनाएं",
    badgeCancel: "किसी भी समय रद्द करें या योजनाएं बदलें",
    badgeSafe: "सुरक्षित SSL / AES-256 एन्क्रिप्शन",
    badgeGst: "GST / VAT कर अनुपालन",
    freeCaps: {
      invoices: "5 चालान",
      clients: "3 ग्राहकों तक",
      payments: "मैन्युअल ट्रांसफर",
      retainers: "मैन्युअल बिलिंग",
      team: "एकल खाता",
      storage: "0 MB स्टोरेज",
      bot: "शामिल नहीं",
      tax: "बुनियादी वर्गीकरण"
    },
    proCaps: {
      invoices: "असीमित मात्रा",
      clients: "असीमित ग्राहक",
      payments: "स्ट्राइप और रेज़रपे",
      retainers: "100% स्वचालित",
      team: "15 सीटों तक",
      storage: "50 MB तक स्टोरेज",
      bot: "असीमित कोपायलट",
      tax: "स्वचालित कर गणना"
    }
  },
  ar: {
    badge: "دليل الميزات",
    title: "بيئة العمل المجانية مقابل العمليات النشطة",
    description: "دليل شفاف وصادق لحدود خدماتنا. استخدم الفئة المجانية للتحقق من قوالب وسير العمل الخاص بك، وقم بالترقية إلى Pro أو Team عندما تحتاج إلى أتمتة سلسة وتحصيلات بلا حدود.",
    colFeature: "الميزات والقدرات",
    colFree: "بيئة عمل تجريبية مجانية",
    colPro: "عمليات Pro & Team",
    insideSandbox: "داخل بيئة التجربة:",
    offerBadge: "عرض تجريبي عالي القيمة",
    offerTitle: "قيم الأتمتة الكاملة خالية من المخاطر لمدة 15 يومًا",
    offerText: "انضم إلى آلاف الشركات التي تصدر فواتيرها بسهولة. قم بإعداد بوابات Stripe أو Razorpay، ومزامنة عقود الدفع المتكرر، وتحدث مع AI BabaBot على الفور. لا يلزم وجود بطاقة ائتمان، ويمكنك العودة للخطة المجانية في أي وقت.",
    btnTrial: "ابدأ تجربة Pro لمدة 15 يومًا",
    btnFree: "إنشاء بيئة تجريبية مجانية",
    badgeCancel: "إلغاء أو تغيير الخطط في أي وقت",
    badgeSafe: "تشفير SSL / AES-256 آمن",
    badgeGst: "متوافق مع ضرائب GST / VAT",
    freeCaps: {
      invoices: "5 فواتير",
      clients: "حتى 3 عملاء",
      payments: "تحويلات يدوية",
      retainers: "فواتير يدوية",
      team: "حساب فردي",
      storage: "0 ميغابايت",
      bot: "غير مشمول",
      tax: "تصنيف أساسي"
    },
    proCaps: {
      invoices: "حجم غير محدود",
      clients: "عملاء غير محدودين",
      payments: "Stripe & Razorpay",
      retainers: "مؤتمتة 100%",
      team: "حتى 15 مقعدًا",
      storage: "حتى 50 ميغابايت",
      bot: "مساعد ذكاء اصطناعي غير محدود",
      tax: "حساب ضريبي تلقائي"
    }
  }
};

export default function FreeVsProComparison() {
  const reduceMotion = useReducedMotion();
  const locale = useLocale();
  const tFeatures = useTranslations("Landing.features.items");

  const lang = locale.startsWith("ar") ? "ar" : locale.startsWith("es") ? "es" : locale.startsWith("hi") ? "hi" : "en";
  const copy = LOCALIZED_COPY[lang];

  const comparisonItems = [
    {
      featKey: "automatedInvoicing",
      free: copy.freeCaps.invoices,
      pro: copy.proCaps.invoices,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "clientCrm",
      free: copy.freeCaps.clients,
      pro: copy.proCaps.clients,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "premiumProposals",
      free: copy.freeCaps.payments,
      pro: copy.proCaps.payments,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "zeroEffortRetainers",
      free: copy.freeCaps.retainers,
      pro: copy.proCaps.retainers,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "multiLevelRoles",
      free: copy.freeCaps.team,
      pro: copy.proCaps.team,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "expenseLedger",
      free: copy.freeCaps.storage,
      pro: copy.proCaps.storage,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "aiBabaBotInsights",
      free: copy.freeCaps.bot,
      pro: copy.proCaps.bot,
      freeIcon: Lock,
      proIcon: Check
    },
    {
      featKey: "caCompliance",
      free: copy.freeCaps.tax,
      pro: copy.proCaps.tax,
      freeIcon: Lock,
      proIcon: Check
    }
  ];

  const trackTrialClick = (_source: string) => {
    emitMarketingAnalyticsEvent("marketing_trial_cta_clicked", {
      location: "free_vs_pro_comparison",
      label: copy.btnTrial,
      primaryCta: "/signup?plan=pro&cycle=monthly&trial=15&source=comparison_free_pro"
    });
  };

  return (
    <section className="bg-zinc-50 py-24 dark:bg-zinc-950/40 relative overflow-hidden border-t border-border">
      {/* Subtle modern blur circles */}
      <div className="pointer-events-none absolute -right-20 top-20 h-80 w-80 rounded-full bg-emerald-500/5 blur-[90px]" />
      <div className="pointer-events-none absolute -left-20 bottom-20 h-96 w-96 rounded-full bg-orange-600/5 blur-[100px]" />

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mb-16 text-center max-w-3xl mx-auto space-y-4"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            <Unlock className="h-3.5 w-3.5" /> {copy.badge}
          </span>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {copy.title}
          </h2>
          <p className="text-base font-medium text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {copy.description}
          </p>
        </motion.div>

        {/* Desktop View: Clean side-by-side comparison table */}
        <div className="hidden lg:block overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/40 shadow-sm">
          <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/60 font-black text-sm uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-6 py-4">
            <div>{copy.colFeature}</div>
            <div className="text-center">{copy.colFree}</div>
            <div className="text-center text-orange-600 dark:text-orange-400">{copy.colPro}</div>
          </div>

          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
            {comparisonItems.map((item, idx) => {
              const featTitle = tFeatures(`${item.featKey}.title`);
              const featDesc = tFeatures(`${item.featKey}.description`);

              return (
                <motion.div
                  key={item.featKey}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: reduceMotion ? 0 : idx * 0.04 }}
                  className="grid grid-cols-[1.5fr_1fr_1fr] items-center px-6 py-6 transition hover:bg-zinc-50/30 dark:hover:bg-zinc-900/20"
                >
                  <div className="space-y-1">
                    <p className="text-base font-black text-zinc-900 dark:text-zinc-100">{featTitle}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed">{featDesc}</p>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1.5 text-center">
                    <div className="inline-flex rounded-full bg-zinc-100 p-1.5 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                      <item.freeIcon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{item.free}</span>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-1.5 text-center bg-orange-600/5 dark:bg-orange-600/10 py-3 rounded-xl border border-orange-500/10 dark:border-orange-500/5">
                    <div className="inline-flex rounded-full bg-emerald-500/10 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <item.proIcon className="h-4 w-4 stroke-[2.5px]" />
                    </div>
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-50">{item.pro}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Mobile & Tablet View: Stacked feature cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:hidden">
          {comparisonItems.map((item, idx) => {
            const featTitle = tFeatures(`${item.featKey}.title`);
            const featDesc = tFeatures(`${item.featKey}.description`);

            return (
              <motion.div
                key={item.featKey}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: reduceMotion ? 0 : idx * 0.04 }}
                className="flex flex-col justify-between p-6 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40 shadow-sm"
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-black text-zinc-900 dark:text-zinc-50">{featTitle}</h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{featDesc}</p>
                  </div>

                  <hr className="border-zinc-100 dark:border-zinc-800/80" />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-center dark:border-zinc-800/60 dark:bg-zinc-900/60">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{copy.colFree}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1">
                        <item.freeIcon className="h-3 w-3" /> {item.free}
                      </p>
                    </div>
                    <div className="rounded-xl border border-orange-500/10 bg-orange-500/5 p-3 text-center dark:border-orange-500/5 dark:bg-orange-950/20">
                      <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-400">{copy.colPro}</p>
                      <p className="mt-1 text-xs font-black text-zinc-950 dark:text-zinc-50 flex items-center justify-center gap-1">
                        <item.proIcon className="h-3 w-3 text-emerald-500 stroke-[2.5px]" /> {item.pro}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* High-Impact Signup Conversion Bar */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mt-14 rounded-3xl border border-orange-500 bg-zinc-900 p-8 dark:bg-zinc-950/80 text-white shadow-xl shadow-orange-500/10 relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-8"
        >
          <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-orange-600/20 blur-3xl" />

          <div className="space-y-4 max-w-2xl relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
              <Sparkles className="h-3.5 w-3.5" /> {copy.offerBadge}
            </span>
            <h3 className="text-2xl font-black tracking-tight md:text-3xl">
              {copy.offerTitle}
            </h3>
            <p className="text-zinc-300 text-sm leading-relaxed font-medium">
              {copy.offerText}
            </p>
          </div>

          <div className="flex shrink-0 flex-col sm:flex-row gap-3 relative z-10 w-full md:w-auto">
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto h-14 rounded-2xl bg-orange-600 text-white font-black text-base shadow-lg shadow-orange-600/20 hover:bg-orange-700 active:scale-95 transition-transform"
            >
              <Link
                href="/signup?plan=pro&cycle=monthly&trial=15&source=comparison_free_pro"
                onClick={() => trackTrialClick("free_pro_conversion")}
              >
                {copy.btnTrial} <ArrowRight className="h-5 w-5 ml-2" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto h-14 rounded-2xl border-white/20 bg-transparent text-white hover:bg-white/10 font-bold text-base active:scale-95 transition-transform"
            >
              <Link href="/signup?plan=free&source=comparison_free_pro_free">
                {copy.btnFree}
              </Link>
            </Button>
          </div>
        </motion.div>

        <div className="mt-8 flex flex-wrap justify-center gap-6 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {copy.badgeCancel}</div>
          <div className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {copy.badgeSafe}</div>
          <div className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {copy.badgeGst}</div>
        </div>
      </div>
    </section>
  );
}

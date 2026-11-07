"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Calculator,
  BriefcaseBusiness,
  Building2,
  UserRound,
  Laptop,
  ArrowRight,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { DemoLaunchButton } from "@/components/landing/persona/DemoLaunchButton";

const LOCALIZED_COPY = {
  en: {
    badge: "Interactive Playgrounds",
    title: "Choose your sandbox environment",
    description: "Provision a fresh, fully pre-seeded workspace tailored to your business model in under 10 seconds. Evaluate real invoicing, bookkeeping, and compliance workflows with zero sign-up friction.",
    tryDemo: "Try {name} Demo",
    guideBadge: "Interactive Guide",
    guideText: "Inside each demo, look for the sticky prompt with \"Start using this setup\" to transition your seeded setup into a live 15-day trial."
  },
  es: {
    badge: "Patios de recreo interactivos",
    title: "Elige tu entorno de pruebas",
    description: "Aprovisiona un espacio de trabajo fresco y presembrado adaptado a tu modelo de negocio en menos de 10 segundos. Evalúa flujos de facturación, contabilidad y cumplimiento reales sin fricciones de registro.",
    tryDemo: "Probar demo de {name}",
    guideBadge: "Guía Interactiva",
    guideText: "Dentro de cada demostración, busca el aviso adhesivo con \"Comenzar a usar esta configuración\" para realizar la transición de tu entorno de prueba a una versión de evaluación Pro de 15 días."
  },
  hi: {
    badge: "इंटरएक्टिव सैंडबॉक्स",
    title: "अपना सैंडबॉक्स वातावरण चुनें",
    description: "10 सेकंड से कम समय में अपने व्यावसायिक मॉडल के अनुकूल एक नया, पूरी तरह से प्री-सीडेड कार्यक्षेत्र तैयार करें। बिना किसी साइन-अप झंझट के वास्तविक चालान-प्रक्रिया, बहीखाता और अनुपालन वर्कफ़्लो का मूल्यांकन करें।",
    tryDemo: "{name} डेमो आज़माएं",
    guideBadge: "इंटरएCTIV गाइड",
    guideText: "प्रत्येक डेमो के अंदर, अपनी सीडेड सेटअप को लाइव 15-दिवसीय परीक्षण में बदलने के लिए \"इस सेटअप का उपयोग करना शुरू करें\" वाले स्टिकी प्रॉम्प्ट को खोजें।"
  },
  ar: {
    badge: "ملاعب تفاعلية",
    title: "اختر بيئة الحماية الخاصة بك",
    description: "قم بإنشاء مساحة عمل جديدة ومجهزة بالكامل ومخصصة لنموذج عملك في أقل من 10 ثوانٍ. قم بتقييم الفواتير الحقيقية ومسك الدفاتر وسير عمل الامتثال دون أي عقبات في التسجيل.",
    tryDemo: "جرب ديمو {name}",
    guideBadge: "دليل تفاعلي",
    guideText: "داخل كل عرض تجريبي، ابحث عن الرسالة الملصقة \"ابدأ استخدام هذا الإعداد\" للانتقال ببيئة الاختبار إلى تجربة Pro حية لمدة 15 يومًا."
  }
};

export default function RoleDemoLauncher() {
  const reduceMotion = useReducedMotion();
  const locale = useLocale();
  
  const tAuth = useTranslations("AuthModal.demoTemplates");
  const tFeatures = useTranslations("Landing.features.items");
  const tNav = useTranslations("LandingNavbar.nav");

  const lang = locale.startsWith("ar") ? "ar" : locale.startsWith("es") ? "es" : locale.startsWith("hi") ? "hi" : "en";
  const copy = LOCALIZED_COPY[lang];

  const roleCards = [
    {
      templateKey: "tax_agency" as const,
      icon: Calculator,
      badgeKey: "forCa.title",
      color: "emerald",
      bgClass: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
      borderHoverClass: "hover:border-emerald-500/30 hover:shadow-[0_8px_30px_rgba(16,185,129,0.06)] dark:hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)]",
      badgeClass: "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
      btnClass: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-800",
      featureKeys: [
        "globalCompliance",
        "caCompliance",
        "bankReconciliation"
      ]
    },
    {
      templateKey: "dm_agency" as const,
      icon: BriefcaseBusiness,
      badgeKey: "forAgencies.title",
      color: "blue",
      bgClass: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
      borderHoverClass: "hover:border-blue-500/30 hover:shadow-[0_8px_30px_rgba(59,130,246,0.06)] dark:hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)]",
      badgeClass: "bg-blue-100/80 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
      btnClass: "hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-800",
      featureKeys: [
        "zeroEffortRetainers",
        "premiumProposals",
        "clientCrm"
      ]
    },
    {
      templateKey: "contractor_builder" as const,
      icon: Building2,
      badgeKey: "forContractors.title",
      color: "orange",
      bgClass: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
      borderHoverClass: "hover:border-orange-500/30 hover:shadow-[0_8px_30px_rgba(249,115,22,0.06)] dark:hover:shadow-[0_8px_30px_rgba(249,115,22,0.12)]",
      badgeClass: "bg-orange-100/80 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
      btnClass: "hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-300 dark:hover:border-orange-800",
      featureKeys: [
        "automatedInvoicing",
        "expenseLedger",
        "multiLevelRoles"
      ]
    },
    {
      templateKey: "freelancer_consultant" as const,
      icon: UserRound,
      badgeKey: "forFreelancers.title",
      color: "purple",
      bgClass: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
      borderHoverClass: "hover:border-purple-500/30 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] dark:hover:shadow-[0_8px_30px_rgba(168,85,247,0.12)]",
      badgeClass: "bg-purple-100/80 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
      btnClass: "hover:bg-purple-50 dark:hover:bg-purple-950/30 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-300 dark:hover:border-purple-800",
      featureKeys: [
        "premiumProposals",
        "zeroEffortRetainers",
        "pwaImplementation"
      ]
    },
    {
      templateKey: "software_company" as const,
      icon: Laptop,
      badgeKey: "forSmallBusinesses.title",
      color: "rose",
      bgClass: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
      borderHoverClass: "hover:border-rose-500/30 hover:shadow-[0_8px_30px_rgba(244,63,94,0.06)] dark:hover:shadow-[0_8px_30px_rgba(244,63,94,0.12)]",
      badgeClass: "bg-rose-100/80 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
      btnClass: "hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-800",
      featureKeys: [
        "aiBabaBotInsights",
        "automatedInvoicing",
        "multiChannelNotifications"
      ]
    }
  ];

  return (
    <section className="relative overflow-hidden bg-zinc-50/70 py-20 dark:bg-zinc-950/30">
      {/* Background visual blur bubbles for blending in with hero design */}
      <div className="pointer-events-none absolute left-1/4 top-10 h-72 w-72 rounded-full bg-orange-500/5 blur-[80px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-10 h-80 w-80 rounded-full bg-blue-500/5 blur-[90px]" />

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mb-14 text-center max-w-3xl mx-auto space-y-4"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            <Sparkles className="h-3.5 w-3.5" /> {copy.badge}
          </span>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {copy.title}
          </h2>
          <p className="text-base font-medium text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {copy.description}
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-6">
          {roleCards.map((card, idx) => {
            const title = tAuth(`${card.templateKey}.title`);
            const description = tAuth(`${card.templateKey}.description`);
            const badgeLabel = tNav(card.badgeKey);
            const tryDemoLabel = copy.tryDemo.replace("{name}", title);

            return (
              <motion.article
                key={card.templateKey}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.4, delay: reduceMotion ? 0 : idx * 0.05 }}
                className={`w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] xl:w-[360px] flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white/70 p-6 backdrop-blur-md transition-all duration-300 dark:border-zinc-800/80 dark:bg-zinc-900/40 ${card.borderHoverClass}`}
              >
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div className={`inline-flex rounded-xl p-2.5 ${card.bgClass}`}>
                      <card.icon className="h-5 w-5" />
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${card.badgeClass}`}>
                      {badgeLabel}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-50">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
                  </div>

                  <hr className="border-zinc-100 dark:border-zinc-800/80" />

                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {lang === "en" ? "Inside the sandbox:" : lang === "es" ? "Dentro de la caja de arena:" : lang === "hi" ? "सैंडबॉक्स के अंदर:" : "داخل بيئة التجربة:"}
                    </p>
                    <ul className="space-y-2">
                      {card.featureKeys.map((featKey, i) => (
                        <li key={i} className="flex items-start text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mr-2 mt-0.5 flex-shrink-0 animate-pulse" />
                          {tFeatures(`${featKey}.title`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-8">
                  <DemoLaunchButton
                    templateKey={card.templateKey}
                    label={tryDemoLabel}
                    analyticsContext="homepage_unified_demo"
                    className={`w-full h-11 justify-center rounded-xl border border-zinc-200/80 dark:border-zinc-800 text-sm font-bold bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors ${card.btnClass}`}
                  />
                </div>
              </motion.article>
            );
          })}
        </div>

        <div className="mt-12 max-w-4xl mx-auto rounded-2xl border border-orange-200/80 bg-orange-50/70 p-4 text-sm font-medium text-zinc-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-zinc-200 flex items-center justify-between gap-4 flex-col sm:flex-row text-center sm:text-left">
          <div className="flex items-center gap-3 flex-col sm:flex-row">
            <span className="inline-flex rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-orange-700 dark:text-orange-400 flex-shrink-0">
              {copy.guideBadge}
            </span>
            <p className="text-xs sm:text-sm">
              {copy.guideText}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-orange-500 hidden sm:inline flex-shrink-0" />
        </div>
      </div>
    </section>
  );
}

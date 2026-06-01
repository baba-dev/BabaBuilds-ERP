"use client";

import { m, LazyMotion, domAnimation } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function FinalCTAV3() {
  const t = useTranslations("LandingV3.FinalCTA");
  
  return (
    <section className="relative overflow-hidden py-32 px-6">
      <div className="absolute inset-0 -z-10 bg-zinc-950">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute bottom-0 left-1/2 h-[500px] w-[1000px] -translate-x-1/2 translate-y-1/2 rounded-full bg-orange-500/20 blur-[120px]"></div>
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <LazyMotion features={domAnimation}>
          <m.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8 text-4xl font-black tracking-tight text-white md:text-6xl"
          >
            {t("title")}
          </m.h2>

          <m.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mx-auto mb-12 max-w-2xl text-lg text-zinc-300 md:text-xl"
          >
            {t("subtitle")}
          </m.p>

          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Button
              asChild
              size="lg"
              className="h-14 rounded-2xl bg-orange-500 px-8 text-lg font-bold text-white shadow-xl shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95"
            >
              <a href="/signup?plan=free">{t("ctaFree")}</a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="group h-14 rounded-2xl border-zinc-700 bg-transparent px-8 text-lg font-bold text-white transition-all hover:bg-zinc-800 active:scale-95"
            >
              <a href="/signup?plan=pro&trial=15">
                {t("ctaPro")}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
          </m.div>
        </LazyMotion>
      </div>
    </section>
  );
}

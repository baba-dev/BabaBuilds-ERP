"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ShieldCheck,
  Users2,
  Wallet,
  Store,
  Target,
  Siren,
  FileText,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

// Mapping module keys to icons
const moduleIcons = {
  taxAdvanced: ShieldCheck,
  workforce: Users2,
  payroll: Wallet,
  shop: Store,
  revenuePipeline: Target,
  arCollections: Siren,
  documents: FileText,
} as const;

type ModuleKey = keyof typeof moduleIcons;

export default function OptionalModulesSlider() {
  const t = useTranslations("LandingPhase1.optionalModules");
  const reduceMotion = useReducedMotion();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const modules = Object.keys(moduleIcons) as ModuleKey[];

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener("resize", handleScroll);
    return () => window.removeEventListener("resize", handleScroll);
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = scrollContainerRef.current.clientWidth * 0.8;
    scrollContainerRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className="relative overflow-hidden border-y border-border bg-surface-base py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12 flex flex-col items-center justify-between gap-6 md:flex-row md:items-end">
          <div className="space-y-3">
            <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("title")}
            </h2>
            <p className="max-w-2xl text-lg text-muted-body">
              {t("subtitle")}
            </p>
          </div>
          
          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-elevated text-foreground transition-all disabled:opacity-30 disabled:hover:bg-surface-elevated hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-elevated text-foreground transition-all disabled:opacity-30 disabled:hover:bg-surface-elevated hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Fluid Horizontal Slider using CSS Scroll Snap */}
        <div className="relative -mx-6 px-6 sm:mx-0 sm:px-0">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-8 pt-4 sm:snap-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {modules.map((key, idx) => {
              const Icon = moduleIcons[key];
              return (
                <motion.article
                  key={key}
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.4, delay: reduceMotion ? 0 : idx * 0.05 }}
                  className="group relative flex w-[85vw] shrink-0 snap-center flex-col justify-between overflow-hidden rounded-3xl border border-border/80 bg-surface-elevated p-8 shadow-sm transition-all hover:border-orange-500/30 hover:shadow-md hover:shadow-orange-500/5 sm:w-[320px] md:w-[360px]"
                >
                  <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-orange-500/5 transition-transform duration-500 group-hover:scale-150 group-hover:bg-orange-500/10" />
                  
                  <div className="relative z-10 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
                    <Icon className="h-7 w-7" strokeWidth={1.5} />
                  </div>
                  
                  <div className="relative z-10 space-y-3">
                    <h3 className="text-xl font-bold tracking-tight text-foreground">
                      {t(`modules.${key}.title`)}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-body">
                      {t(`modules.${key}.description`)}
                    </p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

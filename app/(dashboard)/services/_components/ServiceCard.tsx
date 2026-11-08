"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Copy, FilePlus, MoreHorizontal, Pencil, Repeat, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usageOf, type ServiceItem } from "./service-types";

type Props = {
  service: ServiceItem;
  index: number;
  view: "grid" | "list";
  formatPrice: (value: number | string) => string;
  onEdit: (service: ServiceItem) => void;
  onDuplicate: (service: ServiceItem) => void;
  onDelete: (service: ServiceItem) => void;
  onRetainer: (service: ServiceItem) => void;
};

/** Deterministic soft gradient per service so image-less cards still feel distinct. */
const GRADIENTS = [
  "from-indigo-500/90 to-violet-500/90",
  "from-orange-500/90 to-amber-400/90",
  "from-emerald-500/90 to-teal-400/90",
  "from-sky-500/90 to-cyan-400/90",
  "from-rose-500/90 to-pink-400/90",
  "from-fuchsia-500/90 to-purple-500/90",
];
function gradientFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

function UsageChips({ service }: { service: ServiceItem }) {
  const t = useTranslations("ServiceCatalog.card");
  const proposals = service.usage?.proposals ?? 0;
  const retainers = service.usage?.retainers ?? 0;
  if (proposals + retainers === 0) return <span className="text-xs text-muted-foreground">{t("unused")}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {proposals > 0 && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">{t("inProposals", { count: proposals })}</span>}
      {retainers > 0 && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">{t("inRetainers", { count: retainers })}</span>}
    </div>
  );
}

export function ServiceCard({ service, index, view, formatPrice, onEdit, onDuplicate, onDelete, onRetainer }: Props) {
  const t = useTranslations("ServiceCatalog.card");
  const reduce = useReducedMotion();
  const sac = service.sacCode?.code;
  const nic = service.nicCode?.code;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 rounded-lg" aria-label={t("more", { name: service.name })}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onEdit(service)}>
          <Pencil className="size-4" aria-hidden /> {t("edit")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate(service)}>
          <Copy className="size-4" aria-hidden /> {t("duplicate")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(service)}>
          <Trash2 className="size-4" aria-hidden /> {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const motionProps = reduce
    ? {}
    : {
        layout: true as const,
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0, transition: { delay: Math.min(index, 8) * 0.04, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] as const } },
        exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
      };

  if (view === "list") {
    return (
      <motion.li {...motionProps} className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-colors hover:border-indigo-500/40 sm:gap-4 sm:p-4">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base font-bold text-white", gradientFor(service.name))} aria-hidden>
          {service.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onEdit(service)} className="block max-w-full truncate rounded-md text-start font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {service.name}
          </button>
          <p className="truncate text-xs text-muted-foreground">{service.description || t("noDescription")}</p>
        </div>
        <div className="hidden min-w-[7rem] md:block">
          <UsageChips service={service} />
        </div>
        <p className="shrink-0 text-end text-base font-bold tabular-nums">{formatPrice(service.defaultPrice)}</p>
        <Button asChild size="sm" variant="outline" className="hidden shrink-0 gap-1.5 rounded-lg sm:inline-flex">
          <Link href={`/income/new?service=${service.id}`}>
            <FilePlus className="size-3.5" aria-hidden /> {t("invoice")}
          </Link>
        </Button>
        {menu}
      </motion.li>
    );
  }

  return (
    <motion.li
      {...motionProps}
      whileHover={reduce ? undefined : { y: -3 }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-lg"
    >
      <div className="relative h-28 overflow-hidden sm:h-32">
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied hero stored in private uploads
          <img src={service.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className={cn("flex size-full items-center justify-center bg-gradient-to-br", gradientFor(service.name))} aria-hidden>
            <span className="select-none text-5xl font-black text-white/90 drop-shadow-sm">{service.name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" aria-hidden />
        <span className="absolute bottom-2.5 start-3 rounded-lg bg-background/90 px-2.5 py-1 text-sm font-bold tabular-nums shadow-sm backdrop-blur">{formatPrice(service.defaultPrice)}</span>
        <div className="absolute end-2 top-2 rounded-lg bg-background/80 backdrop-blur">{menu}</div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="line-clamp-1 text-base font-semibold leading-tight tracking-tight">{service.name}</h3>
          <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{service.description || t("noDescription")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", sac ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")} title={service.sacCode?.description}>
            <Tag className="size-3" aria-hidden />
            {sac ? sac : t("noTaxCode")}
          </span>
          {nic && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 font-medium text-sky-700 dark:text-sky-300" title={service.nicCode?.description}>{nic}</span>}
        </div>

        <UsageChips service={service} />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
        <Button asChild size="sm" variant="primary-action" className="gap-1.5 rounded-lg">
          <Link href={`/income/new?service=${service.id}`}>
            <FilePlus className="size-3.5" aria-hidden /> {t("invoice")}
          </Link>
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => onRetainer(service)}>
          <Repeat className="size-3.5" aria-hidden /> {t("retainer")}
        </Button>
      </div>
      <span className="sr-only">{t("usedCount", { count: usageOf(service) })}</span>
    </motion.li>
  );
}

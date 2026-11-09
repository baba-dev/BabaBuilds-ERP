"use client";

import { Banknote, Blocks, BellRing, Bot, Building2, ChartColumnBig, CreditCard, FileText, HandCoins, Landmark, Mail, Mailbox, Receipt, ShieldCheck, ShoppingCart, Siren, Smartphone, Store, Target, UploadCloud, UserRound, Users, Users2, Waves, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Banknote, Blocks, BellRing, Bot, Building2, ChartColumnBig, CreditCard, FileText, HandCoins, Landmark, Mail, Mailbox, Receipt, ShieldCheck, ShoppingCart, Siren, Smartphone, Store, Target, UploadCloud, UserRound, Users, Users2, Waves };

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon className={className} aria-hidden />;
}

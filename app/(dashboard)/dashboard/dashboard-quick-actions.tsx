import Link from "next/link";
import { ArrowRight, FilePlus2, Receipt, ShoppingBag, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

const actions = [
  { href: "/invoices/new", label: "Create invoice", icon: FilePlus2 },
  { href: "/proposals/new", label: "Draft proposal", icon: Receipt },
  { href: "/shop", label: "Open shop", icon: ShoppingBag },
  { href: "/accounting", label: "Run integrity check", icon: Shield },
];

export function DashboardQuickActions() {
  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className="text-sm font-semibold">Quick actions</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
            <span className="inline-flex items-center gap-2"><action.icon className="w-4 h-4 text-indigo-500" /> {action.label}</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

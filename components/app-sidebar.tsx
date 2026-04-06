"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession, signIn } from "next-auth/react";
import { 
  LayoutDashboard, 
  FilePlus, 
  Receipt, 
  ShieldCheck, 
  Users, 
  Menu, 
  Box, 
  LogIn, 
  BookText, 
  Landmark, 
  Sparkles, 
  Settings,
  Briefcase, 
  FileSignature 
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserNav } from "@/components/UserNav";

// Centralized route configuration
const routes = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "client_crm", path: "/clients", icon: Users },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature },
  { key: "new_invoice", path: "/invoice", icon: FilePlus },
  { key: "retainers_hub", path: "/retainers", icon: Box },
  { key: "expenses_margins", path: "/expenses", icon: Receipt },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles },
  { key: "audit_ledger", path: "/ledger", icon: BookText },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
  { key: "settings", path: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession(); 
  const t = useTranslations('Sidebar');

  // Reusable Nav Links for both Desktop and Mobile
  const NavLinks = () => (
    <nav className="grid items-start gap-2 px-4 text-sm font-medium">
      {routes.map((route) => {
        const Icon = route.icon;
        const isActive = pathname === route.path;

        return (route as any).disabled ? (
          <div key={route.key} className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-body opacity-70 cursor-not-allowed">
            <Icon className="h-4 w-4" />
            {t(route.key)}
            <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider font-bold border-border px-1.5 py-0.5 rounded-sm text-muted-body bg-transparent h-auto">
              {t('soon')}
            </Badge>
          </div>
        ) : (
          <Link
            key={route.key}
            href={route.path}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isActive
                ? "bg-accent-strong text-white shadow-md"
                : "text-foreground hover:bg-surface-glass"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(route.key)}
          </Link>
        );
      })}
    </nav>
  );

  // Dynamic Auth UI (Handles Loading, Logged In, and Logged Out states)
  const AuthSection = () => {
    if (status === "loading") {
      return (
        <div className="flex items-center gap-3 rounded-xl bg-surface-base p-3 border border-border animate-pulse">
          <div className="h-9 w-9 rounded-full bg-muted"></div>
          <div className="flex flex-col gap-2 w-full">
            <div className="h-3 w-24 bg-muted rounded"></div>
            <div className="h-2 w-16 bg-muted rounded"></div>
          </div>
        </div>
      );
    }

    // --- INTEGRATED UserNav COMPONENT ---
    if (session?.user) {
      return <UserNav />;
    }

    return (
      <Button
        onClick={() => signIn("google")}
        className="btn-primary w-full py-6 text-sm border-none focus-visible:ring-offset-background"
      >
        <LogIn className="h-4 w-4" />
        {t('sign_in_google')}
      </Button>
    );
  };

  return (
    <>
      {/* --- DESKTOP SIDEBAR --- */}
      <div className="hidden border-r border-border bg-surface-glass backdrop-blur-2xl md:block md:w-64 md:fixed md:inset-y-0 z-50 shadow-[rgba(0,0,0,0.25)_4px_0px_20px]">
        <div className="flex h-full max-h-screen flex-col gap-2 bg-gradient-to-b from-white/[0.03] to-transparent dark:from-white/[0.02]">
          
          {/* Brand Logo Area */}
          <div className="flex h-16 items-center border-b border-border px-6 shrink-0">
            <Link href="/" className="flex items-center gap-3 font-bold text-foreground group">
              <div className="bg-accent-strong p-1.5 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Box className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg tracking-tight text-foreground hover:text-accent-strong transition-colors">{t('bababuilds_erp')}</span>
            </Link>
          </div>
          
          {/* Navigation Links */}
          <div className="flex-1 overflow-auto py-6 custom-scrollbar">
            <NavLinks />
          </div>
          
          {/* Bottom User Profile */}
          <div className="mt-auto p-4 border-t border-border shrink-0">
            <AuthSection />
          </div>

        </div>
      </div>

      {/* --- MOBILE TOP NAVBAR & DRAWER --- */}
      <header className="flex h-16 items-center gap-4 border-b border-border bg-surface-glass backdrop-blur-2xl px-4 md:hidden sticky top-0 z-50 shadow-lg shadow-black/20">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="text-foreground hover:bg-surface-glass">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] bg-surface-glass border-r border-border p-0 text-foreground flex flex-col h-full backdrop-blur-3xl shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            
            <div className="flex h-16 items-center border-b border-border px-6 shrink-0">
              <Link href="/" className="flex items-center gap-3 font-bold text-foreground">
                <div className="bg-accent-strong p-1.5 rounded-lg">
                  <Box className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg tracking-tight text-foreground">{t('bababuilds_erp')}</span>
              </Link>
            </div>
            
            <div className="py-6 flex-1 overflow-auto">
              <NavLinks />
            </div>

            {/* Mobile Bottom Profile */}
            <div className="p-4 border-t border-border shrink-0">
              <AuthSection />
            </div>
          </SheetContent>
        </Sheet>
        <div className="w-full flex-1 flex items-center gap-2">
           <span className="font-bold text-foreground text-lg tracking-tight">{t('bababuilds')}</span>
        </div>
      </header>
    </>
  );
}

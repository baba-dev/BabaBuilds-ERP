"use client";

import { ReactNode } from "react";
import AuthModal from "@/components/AuthModal";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { MobileBottomNav, getSectionKey, isFocusRoute } from "@/components/layout/mobile-nav";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const AIChatbot = dynamic(() => import("@/components/AIChatbot"), {
  ssr: false,
  loading: () => null,
});

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const tSidebar = useTranslations("Sidebar");
  const isLoginRoute = pathname === "/login";
  const focusRoute = isFocusRoute(pathname);
  const sectionKey = getSectionKey(pathname);
  const sectionTitle = sectionKey ? tSidebar(sectionKey) : tSidebar("bababuilds_erp");

  return (
    <OnboardingProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-surface-base" data-focus-route={focusRoute ? "true" : undefined}>
          <main className="dashboard-motion-surface relative h-full min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain bg-surface-base text-foreground">
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
              <div className="absolute -top-28 right-[-8%] h-[380px] w-[380px] rounded-full bg-orange-500/[0.07] blur-[100px] dark:bg-orange-500/[0.11]" />
              <div className="absolute bottom-[-10%] left-[-5%] h-[280px] w-[280px] rounded-full bg-amber-400/[0.06] blur-[88px] dark:bg-amber-400/[0.09]" />
            </div>
            <div className="relative z-10 pb-[calc(var(--mobile-bottomnav-h)+env(safe-area-inset-bottom,0px))] md:pb-0">
              {!isLoginRoute && (
                <div
                  data-slot="mobile-top-bar"
                  className="sticky top-0 z-30 border-b border-border/60 bg-surface-base/90 pt-safe ps-safe pe-safe backdrop-blur-md md:hidden"
                >
                  <div className="flex h-14 items-center gap-1 px-2">
                    <SidebarTrigger />
                    <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">
                      {sectionTitle}
                    </h2>
                  </div>
                </div>
              )}
              {!isLoginRoute && <AuthModal />}
              {children}
            </div>
          </main>
        </SidebarInset>
        <MobileBottomNav />
        <AIChatbot />
      </SidebarProvider>
    </OnboardingProvider>
  );
}

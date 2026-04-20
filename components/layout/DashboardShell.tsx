"use client";

import { ReactNode } from "react";
import AuthModal from "@/components/AuthModal";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AIChatbot = dynamic(() => import("@/components/AIChatbot"), {
  ssr: false,
  loading: () => null,
});

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginRoute = pathname === "/login";
  return (
    <OnboardingProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-surface-base">
          <main className="dashboard-motion-surface relative flex-1 overflow-hidden bg-surface-base text-foreground">
            <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
              <div className="absolute -top-28 right-[-8%] h-[380px] w-[380px] rounded-full bg-orange-500/[0.07] blur-[100px] dark:bg-orange-500/[0.11]" />
              <div className="absolute bottom-[-10%] left-[-5%] h-[280px] w-[280px] rounded-full bg-amber-400/[0.06] blur-[88px] dark:bg-amber-400/[0.09]" />
            </div>
            <div className="relative z-10">
              {!isLoginRoute && <AuthModal />}
              {children}
            </div>
          </main>
        </SidebarInset>
        <AIChatbot />
      </SidebarProvider>
    </OnboardingProvider>
  );
}

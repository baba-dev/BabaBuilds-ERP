"use client";

import { ReactNode } from "react";
import AuthModal from "@/components/AuthModal";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-white/10 bg-zinc-950/90 px-4 backdrop-blur md:px-6">
          <SidebarTrigger />
        </header>
        <main className="relative flex-1">
          <AuthModal />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

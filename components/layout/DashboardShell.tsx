"use client";

import { ReactNode } from "react";
import AuthModal from "@/components/AuthModal";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="dashboard-motion-surface relative flex-1 overflow-x-hidden">
          <AuthModal />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { CashFlowNav } from "./cash-flow-nav";

export function CashFlowPageShell({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DashboardPageShell title={title} description={description} icon={icon} animated={false}>
      <div className={cn("space-y-7", className)}>
        <div className="space-y-4">
          <CashFlowNav />
          {actions ? <div className="flex items-center justify-end">{actions}</div> : null}
        </div>
        {children}
      </div>
    </DashboardPageShell>
  );
}

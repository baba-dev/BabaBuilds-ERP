import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  animated?: boolean;
  animationClassName?: string;
};

const defaultAnimationClassName =
  "animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out";

export function DashboardPageShell({
  title,
  description,
  actions,
  children,
  animated = true,
  animationClassName = defaultAnimationClassName,
}: DashboardPageShellProps) {
  return (
    <div className="min-h-screen bg-surface-base p-4 md:p-8 transition-colors duration-300">
      <div className={cn("max-w-7xl mx-auto space-y-8", animated && animationClassName)}>
        <div className="page-header-sticky -mx-4 px-4 py-4 md:-mx-8 md:px-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 max-w-7xl mx-auto w-full">
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
              {description ? (
                <p className="text-muted-body font-medium text-sm max-w-xl">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="w-full md:w-auto shrink-0">{actions}</div> : null}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitSidebarAnalyticsEvent } from "@/lib/sidebar-analytics";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: (metadata?: { route?: string; role?: string; module?: string }) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
};

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 256;

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState(SIDEBAR_DEFAULT_WIDTH);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const toggleSidebar = React.useCallback(
    (metadata?: { route?: string; role?: string; module?: string }) => {
      const route = metadata?.route ?? window.location.pathname;
      const role = metadata?.role ?? "unknown";
      const moduleKey = metadata?.module ?? "navigation";

      if (isMobile) {
        setOpenMobile((value) => {
          const next = !value;
          emitSidebarAnalyticsEvent("sidebar_collapse_toggle", { route, role, module: moduleKey, open: next, platform: "mobile" });
          return next;
        });
        return;
      }

      setOpen((value) => {
        const next = !value;
        emitSidebarAnalyticsEvent("sidebar_collapse_toggle", { route, role, module: moduleKey, open: next, platform: "desktop" });
        return next;
      });
    },
    [isMobile],
  );

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
        sidebarWidth,
        setSidebarWidth: (width) => setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))),
      }}
    >
      <div data-slot="sidebar-wrapper" data-state={open ? "expanded" : "collapsed"} className="flex min-h-screen w-full items-start">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isMobile, open, openMobile, setOpenMobile, sidebarWidth, setSidebarWidth } = useSidebar();
  const [isResizing, setIsResizing] = React.useState(false);

  React.useEffect(() => {
    if (!isResizing) return;

    const onMove = (event: MouseEvent) => {
      setSidebarWidth(event.clientX);
    };

    const onUp = () => setIsResizing(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, setSidebarWidth]);

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          aria-label="Mobile navigation menu"
          className={cn(
            "w-[280px] border-r border-white/5 bg-black/95 p-0 text-zinc-50 backdrop-blur-3xl",
            className,
          )}
        >
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      data-slot="sidebar"
      data-state={open ? "expanded" : "collapsed"}
      style={{ width: open ? sidebarWidth : 72 }}
      className={cn(
        "relative hidden border-r border-white/5 bg-black/90 shadow-[rgba(0,0,0,0.5)_4px_0px_20px] backdrop-blur-2xl md:sticky md:inset-y-0 md:top-0 md:flex md:h-screen md:self-start",
        className,
      )}
    >
      {children}
      {open ? (
        <button
          type="button"
          aria-label="Resize sidebar"
          onMouseDown={() => setIsResizing(true)}
          className="absolute right-0 top-0 h-full w-1.5 translate-x-1/2 cursor-col-resize bg-transparent hover:bg-indigo-400/30"
        />
      ) : null}
    </aside>
  );
}

export function SidebarInset({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-slot="sidebar-inset" className={cn("flex min-w-0 flex-1 flex-col bg-background", className)}>
      {children}
    </div>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => toggleSidebar({ module: "navigation" })}
      className={cn("h-9 w-9 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white", className)}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

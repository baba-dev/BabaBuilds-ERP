"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { PanelLeft } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  width: number;
  setWidth: (width: number) => void;
  toggleSidebar: () => void;
};

const SIDEBAR_MIN_WIDTH = 224;
const SIDEBAR_MAX_WIDTH = 420;
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
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [width, setWidth] = React.useState(SIDEBAR_DEFAULT_WIDTH);
  const [prefsHydrated, setPrefsHydrated] = React.useState(false);

  const storageKey = React.useMemo(() => {
    const userId = session?.user && "id" in session.user ? String(session.user.id ?? "anonymous") : "anonymous";
    return `bb.sidebar.${userId}`;
  }, [session]);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    setPrefsHydrated(false);
    const rawState = window.localStorage.getItem(storageKey);
    if (!rawState) {
      setOpen(defaultOpen);
      setWidth(SIDEBAR_DEFAULT_WIDTH);
      setPrefsHydrated(true);
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as { collapsed?: boolean; width?: number };
      if (typeof parsedState.collapsed === "boolean") {
        setOpen(!parsedState.collapsed);
      }
      if (typeof parsedState.width === "number") {
        setWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsedState.width)));
      }
    } catch {
      window.localStorage.removeItem(storageKey);
      setOpen(defaultOpen);
      setWidth(SIDEBAR_DEFAULT_WIDTH);
    } finally {
      setPrefsHydrated(true);
    }
  }, [defaultOpen, storageKey]);

  React.useEffect(() => {
    if (!prefsHydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ collapsed: !open, width }));
  }, [open, prefsHydrated, storageKey, width]);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((value) => !value);
      return;
    }
    setOpen((value) => !value);
  }, [isMobile]);

  return (
    <SidebarContext.Provider
      value={{ open, setOpen, openMobile, setOpenMobile, isMobile, width, setWidth, toggleSidebar }}
    >
      <div
        data-slot="sidebar-wrapper"
        data-state={open ? "expanded" : "collapsed"}
        className="flex min-h-screen w-full items-start"
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isMobile, open, openMobile, setOpenMobile, width, setWidth } = useSidebar();
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      setWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, event.clientX)));
    };
    const onUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, setWidth]);

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
      style={{ width: open ? `${width}px` : "4.5rem" }}
      className={cn(
        "relative hidden border-r border-white/5 bg-black/90 shadow-[rgba(0,0,0,0.5)_4px_0px_20px] backdrop-blur-2xl md:flex md:h-screen md:self-start md:inset-y-0 md:sticky md:top-0",
        className,
      )}
    >
      {children}
      {open ? (
        <button
          type="button"
          aria-label="Resize sidebar"
          onMouseDown={() => setIsDragging(true)}
          className="absolute -right-1 top-0 h-full w-2 cursor-col-resize bg-transparent transition hover:bg-indigo-500/30"
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
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={isMobile ? "Open navigation menu" : "Toggle sidebar"}
      aria-expanded={isMobile ? openMobile : open}
      aria-controls="main-navigation"
      onClick={toggleSidebar}
      className={cn("h-9 w-9 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white", className)}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SetupWizard from "@/components/setup/SetupWizard";

export default function SetupGatekeeper() {
  const { data: session, status, update } = useSession();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // DO NOT show gatekeeper on Help Center routes
    if (pathname?.startsWith("/help")) {
      setIsOpen(false);
      return;
    }

    const email = (session as any)?.user?.email as string | undefined;
    const role = (session as any)?.user?.role as string | undefined;
    const isDemoUser = role === "DEMO" || (typeof email === "string" && email.endsWith("@bababuilds.demo"));

    // Only show if authenticated and setup is strictly false
    if (!isDemoUser && status === "authenticated" && (session as any)?.isSetupComplete === false) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [session, status, pathname]);

  const handleSetupComplete = async () => {
    // 1. Refresh the JWT session so isSetupComplete becomes true globally
    await update();
    // 2. Close the modal
    setIsOpen(false);
  };

  if (status !== "authenticated" || !isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}> 
      {/* onOpenChange is empty to prevent closing by clicking overlay or ESC */}
      <DialogContent
        className="w-[95vw] lg:w-[60vw] min-w-[320px] max-w-[1200px] p-0 overflow-hidden border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Setup Wizard</DialogTitle>
          <DialogDescription>
            Complete your business profile to start using BabaERP.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[90vh] rounded-2xl">
          {/* We pass a callback so the wizard can tell the gatekeeper it's done */}
          <SetupWizard isModal onComplete={handleSetupComplete} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

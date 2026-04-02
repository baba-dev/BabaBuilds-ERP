"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import SetupWizard from "@/app/(dashboard)/setup/page"; // Updated path after route segmentation

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

    // Only show if authenticated and setup is strictly false
    if (status === "authenticated" && (session as any)?.isSetupComplete === false) {
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
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none bg-transparent shadow-none">
        <div className="max-h-[90vh] overflow-y-auto rounded-2xl">
          {/* We pass a callback so the wizard can tell the gatekeeper it's done */}
          <SetupWizard isModal onComplete={handleSetupComplete} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
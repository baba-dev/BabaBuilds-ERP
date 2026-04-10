"use client";

import { useTranslations } from "next-intl";
import { signIn, useSession } from "next-auth/react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/UserNav";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function NavUser() {
  const { status, data: session } = useSession();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-3 animate-pulse">
        <div className="h-9 w-9 rounded-full bg-zinc-800" />
        {(open || isMobile) && (
          <div className="flex w-full flex-col gap-2">
            <div className="h-3 w-24 rounded bg-zinc-800" />
            <div className="h-2 w-16 rounded bg-zinc-800" />
          </div>
        )}
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="flex flex-col gap-1">
        <UserNav />
      </div>
    );
  }

  return (
    <Button
      onClick={() => signIn("google")}
      className={cn(
        "w-full items-center gap-2 rounded-xl bg-indigo-600 px-3 py-6 text-sm font-bold text-white shadow-md shadow-indigo-900/20 hover:bg-indigo-700",
        !open && !isMobile && "justify-center px-2",
      )}
      title={!open && !isMobile ? t("sign_in_google") : undefined}
    >
      <LogIn className="h-4 w-4" />
      {(open || isMobile) && t("sign_in_google")}
    </Button>
  );
}

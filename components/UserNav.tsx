"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { 
  Dialog, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CommsHub } from "@/components/notifications/CommsHub";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function UserNav() {
  const { data: session } = useSession();
  const { open, isMobile } = useSidebar();
  const t = useTranslations('UserNav');

  if (!session?.user) return null;

  const isExpanded = open || isMobile;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button 
          className={cn(
            "group flex items-center gap-3 p-2 rounded-2xl hover:bg-white/10 transition-all duration-300 w-full text-left outline-none",
            "border border-transparent hover:border-zinc-800/50 hover:shadow-lg hover:shadow-black/20",
            !isExpanded && "justify-center p-1.5"
          )}
          title={!isExpanded ? "Comms Hub & Account" : undefined}
        >
          {/* Use NotificationBell as the trigger icon */}
          <NotificationBell 
            className={cn(
              "shrink-0 bg-zinc-900 border border-zinc-800/50 rounded-xl group-hover:bg-zinc-800 group-hover:border-indigo-500/30 transition-all",
              !isExpanded && "h-10 w-10"
            )} 
          />
          
          {isExpanded && (
            <div className="flex flex-col flex-1 overflow-hidden pointer-events-none">
              <p className="text-sm font-bold truncate text-white group-hover:text-indigo-300 transition-colors">
                {session.user.name}
              </p>
              <p className="text-[10px] text-zinc-500 truncate group-hover:text-zinc-400 transition-colors font-medium uppercase tracking-wider">
                {session.user.email}
              </p>
            </div>
          )}
        </button>
      </DialogTrigger>
      
      <CommsHub />
    </Dialog>
  );
}
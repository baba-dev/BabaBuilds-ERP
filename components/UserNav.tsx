"use client";

import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { CreditCard, LifeBuoy, LogOut, Settings, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";

export function UserNav() {
  const { data: session } = useSession();
  const t = useTranslations('UserNav');

  if (!session?.user) return null;

  // Create a fallback initials (e.g., Aditya Sharma -> AS)
  const initials = session.user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">
          <Avatar className="h-9 w-9 border border-zinc-700">
            <AvatarImage src={session.user.image || ""} alt={`${session.user.name}'s profile picture`} />
            <AvatarFallback className="bg-zinc-800 text-zinc-300">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 overflow-hidden text-white">
            <p className="text-sm font-bold truncate">{session.user.name}</p>
            <p className="text-xs text-white/70 truncate">{session.user.email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-56 bg-zinc-950 border-zinc-800 text-zinc-300" align="end" forceMount>
        <DropdownMenuLabel className="font-normal px-4 py-3">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-bold leading-none text-white">{t('my_account')}</p>
            <p className="text-xs leading-none text-white/70 truncate">
              {t('workspace_id')} {(session as any).workspaceId?.substring(0, 8)}...
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-zinc-800" />
        
        <DropdownMenuGroup>
          <Link href="/settings/profile">
            <DropdownMenuItem className="hover:bg-zinc-800 hover:text-white cursor-pointer">
              <UserIcon className="mr-2 h-4 w-4" />
              <span>{t('profile_settings')}</span>
            </DropdownMenuItem>
          </Link>
          <Link href="/settings/billing">
            <DropdownMenuItem className="hover:bg-zinc-800 hover:text-white cursor-pointer text-indigo-400 focus:text-indigo-300">
              <CreditCard className="mr-2 h-4 w-4" />
              <span>{t('billing_plan')}</span>
            </DropdownMenuItem>
          </Link>
          <Link href="/help">
            <DropdownMenuItem className="hover:bg-zinc-800 hover:text-white cursor-pointer text-sky-400 focus:text-sky-300">
              <LifeBuoy className="mr-2 h-4 w-4" />
              <span>Help Center</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator className="bg-zinc-800" />
        <DropdownMenuItem 
          onClick={() => signOut({ callbackUrl: "/" })}
          className="hover:bg-red-900/30 text-red-400 focus:text-red-300 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('log_out')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
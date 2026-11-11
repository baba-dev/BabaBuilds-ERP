'use client';

/**
 * NotificationBell — Sidebar notification trigger variant
 *
 * Positioned in the UserNav area.
 * Shows a badge count and animates when new notifications arrive.
 */

import { useNotificationsContext } from '@/components/notifications/notifications-context';
import { Bell, BellRing } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function NotificationBell({ className }: { className?: string }) {
  const { unreadCount } = useNotificationsContext();

  const [hasRung, setHasRung]     = useState(false);
  const prevCountRef              = useRef(unreadCount);

  // Animate bell when new notification arrives
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only state sync after mount (avoids SSR hydration mismatch)
      setHasRung(true);
      const t = setTimeout(() => setHasRung(false), 1500);
      return () => clearTimeout(t);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <div className={cn("relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200", className)}>
      {hasRung ? (
        <BellRing className="h-5 w-5 text-indigo-400 animate-[wiggle_0.3s_ease-in-out_3]" />
      ) : (
        <Bell className="h-5 w-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
      )}
      {unreadCount > 0 && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold text-white ring-2 ring-zinc-950">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}

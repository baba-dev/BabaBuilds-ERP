'use client';

/**
 * NotificationBell — Sidebar notification inbox
 *
 * Positioned in the NavUser area (replacing the avatar icon section).
 * Shows a badge count, a dropdown list of recent unread notifications,
 * and a "Mark all read" button.
 */

import { useNotifications } from '@/hooks/use-notifications';
import { Bell, BellRing, Check, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { InAppNotification } from '@prisma/client';
import { formatDistanceToNow } from 'date-fns';

const EVENT_ICON: Record<string, string> = {
  INVOICE_GENERATED: '🧾',
  INVOICE_PAID:      '✅',
  PAYMENT_REMINDER:  '⏰',
  CLIENT_ADDED:      '🤝',
  PROPOSAL_CREATED:  '📄',
  SERVICE_CREATED:   '🔧',
  RENEWAL_ALERT:     '🔄',
  DEADLINE_ALERT:    '⚠️',
  TAX_ALERT:         '🏛️',
};

const EVENT_ACCENT: Record<string, string> = {
  INVOICE_GENERATED: 'border-l-indigo-500',
  INVOICE_PAID:      'border-l-emerald-500',
  PAYMENT_REMINDER:  'border-l-amber-500',
  CLIENT_ADDED:      'border-l-sky-500',
  PROPOSAL_CREATED:  'border-l-violet-500',
  SERVICE_CREATED:   'border-l-cyan-500',
  RENEWAL_ALERT:     'border-l-purple-500',
  DEADLINE_ALERT:    'border-l-red-500',
  TAX_ALERT:         'border-l-blue-500',
};

interface NotificationItemProps {
  notification: InAppNotification;
  onRead: (id: string) => void;
}

function NotificationItem({ notification: n, onRead }: NotificationItemProps) {
  const accent = EVENT_ACCENT[n.eventType] ?? 'border-l-zinc-500';
  const icon   = EVENT_ICON[n.eventType]   ?? '🔔';
  const ago    = formatDistanceToNow(new Date(n.createdAt), { addSuffix: true });

  return (
    <div
      className={cn(
        'group relative flex gap-3 rounded-lg border-l-2 bg-zinc-900/60 p-3 transition-all hover:bg-zinc-800/80',
        accent,
      )}
    >
      {/* Icon */}
      <span className="mt-0.5 text-base leading-none">{icon}</span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-100 leading-tight">{n.title}</p>
        <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2">{n.body}</p>
        <p className="mt-1 text-[10px] text-zinc-600">{ago}</p>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-1">
        {n.actionUrl && (
          <a
            href={n.actionUrl}
            onClick={() => onRead(n.id)}
            className="rounded p-1 text-zinc-500 hover:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-colors"
            title="Open"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          onClick={() => onRead(n.id)}
          className="rounded p-1 text-zinc-500 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-colors"
          title="Mark as read"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, requestPushPermission } =
    useNotifications();

  const [open, setOpen]           = useState(false);
  const [hasRung, setHasRung]     = useState(false);
  const panelRef                  = useRef<HTMLDivElement>(null);
  const prevCountRef              = useRef(0);

  // Animate bell when new notification arrives
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setHasRung(true);
      const t = setTimeout(() => setHasRung(false), 1500);
      return () => clearTimeout(t);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Request push on first open
  const [askedPush, setAskedPush] = useState(false);
  const handleOpen = () => {
    setOpen((v) => !v);
    if (!askedPush) {
      setAskedPush(true);
      requestPushPermission();
    }
  };

  return (
    <div ref={panelRef} className="relative">
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        onClick={handleOpen}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition-all duration-200',
          'hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
          open && 'bg-white/10 text-white',
        )}
        aria-label="Notifications"
        title="Notifications"
      >
        {hasRung ? (
          <BellRing className="h-5 w-5 animate-[wiggle_0.3s_ease-in-out_3]" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white ring-2 ring-zinc-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          id="notification-panel"
          className={cn(
            'absolute bottom-12 left-0 z-50 w-80 rounded-2xl',
            'border border-zinc-800 bg-zinc-950/95 shadow-2xl shadow-black/60',
            'backdrop-blur-xl',
            'animate-in fade-in slide-in-from-bottom-2 duration-200',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-bold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                All read
              </button>
            )}
          </div>

          {/* List */}
          <div className="custom-scrollbar max-h-[380px] overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="rounded-full bg-zinc-900 p-3">
                  <Inbox className="h-6 w-6 text-zinc-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">All caught up!</p>
                  <p className="text-xs text-zinc-600">No new notifications</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={(id) => markRead([id])}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-800 px-4 py-2.5">
            <p className="text-center text-[10px] text-zinc-600">
              Notifications are refreshed automatically
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

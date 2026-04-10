'use client';

import * as React from 'react';
import { useNotifications } from '@/hooks/use-notifications';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  ExternalLink, 
  Inbox, 
  User, 
  CreditCard, 
  LifeBuoy, 
  LogOut,
  Shield,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InAppNotification } from '@prisma/client';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

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

const typography = {
  title: 'text-lg font-semibold tracking-tight text-zinc-100',
  subtitle: 'text-sm text-zinc-400',
  metadata: 'text-[11px] font-medium uppercase tracking-wider text-zinc-500',
};

const cardSurfaceClass =
  'rounded-2xl border border-zinc-800/60 bg-zinc-900/45 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]';

const iconContainerClass =
  'flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-300 transition-colors group-hover:bg-indigo-600/20 group-hover:text-indigo-300';

const badgeClass =
  'inline-flex items-center rounded-full border border-zinc-700/70 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300';

function NotificationItem({ notification: n, onRead }: NotificationItemProps) {
  const accent = EVENT_ACCENT[n.eventType] ?? 'border-l-zinc-500';
  const icon   = EVENT_ICON[n.eventType]   ?? '🔔';
  const ago    = formatDistanceToNow(new Date(n.createdAt), { addSuffix: true });

  return (
    <div
      className={cn(
        'group relative flex gap-4 rounded-xl border-l-4 bg-white/[0.03] p-4 transition-all hover:bg-white/[0.06] border border-transparent hover:border-zinc-800/50',
        accent,
      )}
    >
      {/* Icon Group */}
      <div className="flex-shrink-0">
        <div className={cn(iconContainerClass, 'shadow-inner')}>
          <span className="text-xl leading-none">{icon}</span>
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <p className="text-sm font-semibold text-zinc-100 leading-tight group-hover:text-white transition-colors">
          {n.title}
        </p>
        <p className="mt-1 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {n.body}
        </p>
        <p className={cn(typography.metadata, 'mt-2')}>
          {ago}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {n.actionUrl && (
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-indigo-500/20 hover:text-indigo-300"
            title="View Details"
          >
            <a href={n.actionUrl} onClick={() => onRead(n.id)}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
        <Button
          onClick={() => onRead(n.id)}
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-emerald-500/20 hover:text-emerald-300"
          title="Mark as Read"
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function CommsHub() {
  const { data: session } = useSession();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  if (!session?.user) return null;

  return (
    <DialogContent className="max-w-2xl border-zinc-800/50 bg-zinc-950/90 p-0 shadow-2xl backdrop-blur-2xl sm:rounded-3xl overflow-hidden">
      <div className="relative">
        {/* Aesthetic Background Accents */}
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-violet-600/10 blur-[100px] pointer-events-none" />

        <DialogHeader className="px-8 pt-8 pb-4">
          <div className="flex items-center gap-3">
             <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 shadow-lg shadow-indigo-500/10">
                <Zap className="h-6 w-6" />
             </div>
             <div>
               <DialogTitle className="text-2xl font-bold tracking-tight text-white">Comms Hub</DialogTitle>
               <DialogDescription className="text-zinc-500">
                 Unified inbox and account management for {session.user.name}
               </DialogDescription>
             </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="inbox" className="w-full">
          <div className="px-8">
            <TabsList className="w-full justify-start bg-transparent border-b border-zinc-800/50 rounded-none h-auto p-0 gap-8">
              <TabsTrigger 
                value="inbox" 
                className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 rounded-none pb-4 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span>Inbox</span>
                  {unreadCount > 0 && (
                    <span className={cn(badgeClass, 'ml-1 border-indigo-400/40 bg-indigo-500/20 text-indigo-200')}>
                      {unreadCount}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="account" 
                className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 rounded-none pb-4 transition-all"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Account</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="security" 
                className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 rounded-none pb-4 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Security</span>
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <TabsContent value="inbox" className="mt-0 space-y-6 p-8 outline-none motion-safe:transition-all motion-safe:duration-200 data-[state=inactive]:translate-y-1 data-[state=inactive]:opacity-0 data-[state=active]:translate-y-0 data-[state=active]:opacity-100">
              <div className="flex items-center justify-between">
                <h3 className={typography.metadata}>Recent Notifications</h3>
                {notifications.length > 0 && (
                  <Button
                    onClick={markAllRead}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-bold uppercase tracking-wider text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                  >
                    <CheckCheck className="mr-2 h-3.5 w-3.5" />
                    Clear All
                  </Button>
                )}
              </div>
              <Separator className="bg-zinc-800/70" />

              {notifications.length === 0 ? (
                <div className={cn(cardSurfaceClass, 'flex flex-col items-center justify-center py-16 text-center')}>
                  <div className="relative mb-4">
                    <div className="absolute -inset-4 rounded-full bg-indigo-500/10 blur-xl opacity-50" />
                    <Inbox className="relative h-12 w-12 text-zinc-700" />
                  </div>
                  <h4 className={typography.title}>All caught up!</h4>
                  <p className={cn(typography.subtitle, 'mt-1 max-w-[200px]')}>
                    You&apos;ve handled all your recent business notifications.
                  </p>
                </div>
              ) : (
                <div className={cn(cardSurfaceClass, 'space-y-3 p-4')}>
                  {notifications.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onRead={(id) => markRead([id])}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="account" className="mt-0 space-y-6 p-8 outline-none motion-safe:transition-all motion-safe:duration-200 data-[state=inactive]:translate-y-1 data-[state=inactive]:opacity-0 data-[state=active]:translate-y-0 data-[state=active]:opacity-100">
               <div className="grid gap-6">
                  {/* User Profile Summary */}
                  <div className={cn(cardSurfaceClass, 'flex items-center gap-4 p-5')}>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-xl shadow-indigo-500/20">
                      {session.user.name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className={typography.title}>{session.user.name}</h4>
                      <p className={typography.subtitle}>{session.user.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={cn(badgeClass, 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300')}>
                           Professional Plan
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-zinc-800/70" />

                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <Link href="/settings/profile" className="block">
                      <div className={cn(cardSurfaceClass, 'group flex flex-col gap-3 p-5 transition-all hover:border-zinc-700/80 hover:bg-zinc-900/70 text-left')}>
                        <div className={iconContainerClass}>
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <p className={cn(typography.subtitle, 'font-semibold text-zinc-100')}>Profile Settings</p>
                          <p className={typography.metadata}>Manage your personal info</p>
                        </div>
                      </div>
                    </Link>
                    <Link href="/settings/billing" className="block">
                      <div className={cn(cardSurfaceClass, 'group flex flex-col gap-3 p-5 transition-all hover:border-zinc-700/80 hover:bg-zinc-900/70 text-left')}>
                        <div className={iconContainerClass}>
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <p className={cn(typography.subtitle, 'font-semibold text-zinc-100')}>Billing & Plan</p>
                          <p className={typography.metadata}>View invoices & upgrade</p>
                        </div>
                      </div>
                    </Link>
                    <Link href="/help" className="block">
                      <div className={cn(cardSurfaceClass, 'group flex flex-col gap-3 p-5 transition-all hover:border-zinc-700/80 hover:bg-zinc-900/70 text-left')}>
                        <div className={cn(iconContainerClass, 'group-hover:bg-sky-600/20 group-hover:text-sky-300')}>
                          <LifeBuoy className="h-5 w-5" />
                        </div>
                        <div>
                          <p className={cn(typography.subtitle, 'font-semibold text-zinc-100')}>Help Center</p>
                          <p className={typography.metadata}>Guides and support</p>
                        </div>
                      </div>
                    </Link>
                    <button 
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className={cn(cardSurfaceClass, 'group flex flex-col gap-3 border-red-900/40 bg-red-950/10 p-5 text-left transition-all hover:border-red-500/40 hover:bg-red-950/20')}
                    >
                      <div className={cn(iconContainerClass, 'group-hover:bg-red-600/20 group-hover:text-red-300')}>
                        <LogOut className="h-5 w-5" />
                      </div>
                      <div>
                        <p className={cn(typography.subtitle, 'font-semibold text-red-300')}>Sign Out</p>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-red-300/60">End current session</p>
                      </div>
                    </button>
                  </div>
               </div>
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-6 p-8 outline-none motion-safe:transition-all motion-safe:duration-200 data-[state=inactive]:translate-y-1 data-[state=inactive]:opacity-0 data-[state=active]:translate-y-0 data-[state=active]:opacity-100">
              {/* Security Placeholder */}
              <div className={cn(cardSurfaceClass, 'flex flex-col items-center justify-center py-16 text-center')}>
                  <Shield className="h-12 w-12 text-zinc-700 mb-4" />
                  <h4 className={typography.title}>Security & Privacy</h4>
                  <p className={cn(typography.subtitle, 'mt-1 max-w-[300px]')}>
                    Manage your password, two-factor authentication, and active sessions.
                  </p>
                  <Button variant="outline" className="mt-6 border-zinc-800 hover:bg-white/5">
                    Go to Security Settings
                  </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer info */}
        <div className="border-t border-zinc-800/50 bg-white/[0.02] px-8 py-4 flex justify-between items-center">
           <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">BabaBuilds ERP Core</p>
           <p className="text-[10px] text-zinc-600">v2.4.0-stable</p>
        </div>
      </div>
    </DialogContent>
  );
}

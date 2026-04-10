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
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 shadow-inner">
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
        <p className="mt-2 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">
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
  const t = useTranslations('UserNav'); // Re-using UserNav translations

  if (!session?.user) return null;

  return (
    <DialogContent className="w-full max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] md:max-w-3xl lg:max-w-5xl border-zinc-800/50 bg-zinc-950/90 p-0 shadow-2xl backdrop-blur-2xl sm:rounded-3xl overflow-hidden">
      <div className="relative">
        {/* Aesthetic Background Accents */}
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-violet-600/10 blur-[100px] pointer-events-none" />

        <DialogHeader className="px-4 pb-4 pt-6 sm:px-6 sm:pt-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
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
          <div className="px-4 sm:px-6 lg:px-10">
            <TabsList className="mx-auto h-auto w-full max-w-4xl justify-start gap-5 rounded-none border-b border-zinc-800/50 bg-transparent p-0 sm:gap-8">
              <TabsTrigger 
                value="inbox" 
                className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-b-2 data-[state=active]:border-indigo-400 rounded-none pb-4 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span>Inbox</span>
                  {unreadCount > 0 && (
                    <span className="ml-1 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
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
            <TabsContent value="inbox" className="mt-0 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-10">
              <div className="mx-auto w-full max-w-4xl">
                <div className="mb-6 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Recent Notifications</h3>
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

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="relative mb-4">
                    <div className="absolute -inset-4 rounded-full bg-indigo-500/10 blur-xl opacity-50" />
                    <Inbox className="relative h-12 w-12 text-zinc-700" />
                  </div>
                  <h4 className="text-lg font-medium text-zinc-300">All caught up!</h4>
                  <p className="mt-1 max-w-[260px] text-sm text-zinc-600">
                    You&apos;ve handled all your recent business notifications.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
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
            </TabsContent>

            <TabsContent value="account" className="mt-0 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-10">
               <div className="mx-auto grid w-full max-w-4xl gap-6">
                  {/* User Profile Summary */}
                  <div className="flex items-center gap-4 rounded-2xl bg-white/[0.03] p-5 border border-zinc-800/30">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-xl shadow-indigo-500/20">
                      {session.user.name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">{session.user.name}</h4>
                      <p className="text-sm text-zinc-400">{session.user.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                           Professional Plan
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <Link href="/settings/profile" className="block">
                      <div className="group flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-5 border border-zinc-800/30 hover:bg-white/[0.06] hover:border-zinc-700/50 transition-all text-left">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 group-hover:bg-indigo-600/20 group-hover:text-indigo-400 transition-colors">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Profile Settings</p>
                          <p className="text-[11px] text-zinc-500">Manage your personal info</p>
                        </div>
                      </div>
                    </Link>
                    <Link href="/settings/billing" className="block">
                      <div className="group flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-5 border border-zinc-800/30 hover:bg-white/[0.06] hover:border-zinc-700/50 transition-all text-left">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 group-hover:bg-indigo-600/20 group-hover:text-indigo-400 transition-colors">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Billing & Plan</p>
                          <p className="text-[11px] text-zinc-500">View invoices & upgrade</p>
                        </div>
                      </div>
                    </Link>
                    <Link href="/help" className="block">
                      <div className="group flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-5 border border-zinc-800/30 hover:bg-white/[0.06] hover:border-zinc-700/50 transition-all text-left">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 group-hover:bg-sky-600/20 group-hover:text-sky-400 transition-colors">
                          <LifeBuoy className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Help Center</p>
                          <p className="text-[11px] text-zinc-500">Guides and support</p>
                        </div>
                      </div>
                    </Link>
                    <button 
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="group flex flex-col gap-3 rounded-2xl bg-red-500/5 p-5 border border-red-900/10 hover:bg-red-500/10 hover:border-red-500/30 transition-all text-left"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 group-hover:bg-red-600/20 group-hover:text-red-400 transition-colors">
                        <LogOut className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-400">Sign Out</p>
                        <p className="text-[11px] text-red-900/50">End current session</p>
                      </div>
                    </button>
                  </div>
               </div>
            </TabsContent>

            <TabsContent value="security" className="mt-0 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-10">
              {/* Security Placeholder */}
              <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center py-16 text-center">
                  <Shield className="h-12 w-12 text-zinc-700 mb-4" />
                  <h4 className="text-lg font-medium text-zinc-300">Security & Privacy</h4>
                  <p className="text-sm text-zinc-600 max-w-[300px] mt-1">
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
        <div className="border-t border-zinc-800/50 bg-white/[0.02] px-4 py-4 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
           <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">BabaBuilds ERP Core</p>
           <p className="text-[10px] text-zinc-600">v2.4.0-stable</p>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

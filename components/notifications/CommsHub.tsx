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
        'group relative flex gap-4 rounded-xl border border-border/60 border-l-4 bg-muted/40 p-4 transition-all hover:bg-muted',
        accent,
      )}
    >
      {/* Icon Group */}
      <div className="flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/80 shadow-inner ring-1 ring-border/60">
          <span className="text-xl leading-none">{icon}</span>
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <p className="text-sm font-semibold text-foreground leading-tight transition-colors">
          {n.title}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {n.body}
        </p>
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
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
            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-indigo-500/12 dark:hover:bg-indigo-500/22 hover:text-indigo-600 dark:hover:text-indigo-300"
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
          className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-emerald-500/12 dark:hover:bg-emerald-500/22 hover:text-emerald-600 dark:hover:text-emerald-300"
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
    <DialogContent className="max-w-2xl overflow-hidden border-border/70 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl sm:rounded-3xl">
      <div className="relative">
        {/* Aesthetic Background Accents */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-indigo-600/6 blur-[100px] dark:bg-indigo-600/14" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-violet-600/6 blur-[100px] dark:bg-violet-600/14" />

        <DialogHeader className="px-8 pt-8 pb-4">
          <div className="flex items-center gap-3">
             <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/12 text-indigo-600 shadow-lg shadow-indigo-500/10 dark:bg-indigo-500/24 dark:text-indigo-300">
                <Zap className="h-6 w-6" />
             </div>
             <div>
               <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">Comms Hub</DialogTitle>
               <DialogDescription className="text-muted-foreground">
                 Unified inbox and account management for {session.user.name}
               </DialogDescription>
             </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="inbox" className="w-full">
          <div className="px-8">
            <TabsList className="h-auto w-full justify-start gap-8 rounded-none border-b border-border/80 bg-transparent p-0">
              <TabsTrigger 
                value="inbox" 
                className="rounded-none pb-4 text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-300"
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span>Inbox</span>
                  {unreadCount > 0 && (
                    <span className="ml-1 rounded-full bg-indigo-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-indigo-500">
                      {unreadCount}
                    </span>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="account" 
                className="rounded-none pb-4 text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-300"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Account</span>
                </div>
              </TabsTrigger>
              <TabsTrigger 
                value="security" 
                className="rounded-none pb-4 text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-300"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Security</span>
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <TabsContent value="inbox" className="p-8 mt-0 outline-none">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Recent Notifications</h3>
                {notifications.length > 0 && (
                  <Button
                    onClick={markAllRead}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-bold uppercase tracking-wider text-indigo-600 hover:bg-indigo-500/12 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/24 dark:hover:text-indigo-200"
                  >
                    <CheckCheck className="mr-2 h-3.5 w-3.5" />
                    Clear All
                  </Button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="relative mb-4">
                    <div className="absolute -inset-4 rounded-full bg-indigo-500/8 blur-xl opacity-60 dark:bg-indigo-500/20" />
                    <Inbox className="relative h-12 w-12 text-muted-foreground/70" />
                  </div>
                  <h4 className="text-lg font-medium text-foreground">All caught up!</h4>
                  <p className="mt-1 max-w-[200px] text-sm text-muted-foreground">
                    You&apos;ve handled all your recent business notifications.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
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

            <TabsContent value="account" className="p-8 mt-0 outline-none">
               <div className="grid gap-6">
                  {/* User Profile Summary */}
                  <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/40 p-5">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/85 text-2xl font-bold text-white shadow-xl shadow-indigo-500/20 dark:bg-indigo-500">
                      {session.user.name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-foreground">{session.user.name}</h4>
                      <p className="text-sm text-muted-foreground">{session.user.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300 dark:ring-emerald-500/40">
                           Professional Plan
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <Link href="/settings/profile" className="block">
                      <div className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/40 p-5 text-left transition-all hover:bg-muted hover:border-border">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-border/60 transition-colors group-hover:bg-indigo-500/12 group-hover:text-indigo-600 dark:group-hover:bg-indigo-500/24 dark:group-hover:text-indigo-300">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Profile Settings</p>
                          <p className="text-[11px] text-muted-foreground">Manage your personal info</p>
                        </div>
                      </div>
                    </Link>
                    <Link href="/settings/billing" className="block">
                      <div className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/40 p-5 text-left transition-all hover:bg-muted hover:border-border">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-border/60 transition-colors group-hover:bg-indigo-500/12 group-hover:text-indigo-600 dark:group-hover:bg-indigo-500/24 dark:group-hover:text-indigo-300">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Billing & Plan</p>
                          <p className="text-[11px] text-muted-foreground">View invoices & upgrade</p>
                        </div>
                      </div>
                    </Link>
                    <Link href="/help" className="block">
                      <div className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/40 p-5 text-left transition-all hover:bg-muted hover:border-border">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-border/60 transition-colors group-hover:bg-sky-500/12 group-hover:text-sky-600 dark:group-hover:bg-sky-500/24 dark:group-hover:text-sky-300">
                          <LifeBuoy className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">Help Center</p>
                          <p className="text-[11px] text-muted-foreground">Guides and support</p>
                        </div>
                      </div>
                    </Link>
                    <button 
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="group flex flex-col gap-3 rounded-2xl border border-red-500/25 bg-red-500/7 p-5 text-left transition-all hover:bg-red-500/12 dark:bg-red-500/10 dark:hover:bg-red-500/18"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-red-500/20 transition-colors group-hover:bg-red-500/12 group-hover:text-red-600 dark:group-hover:bg-red-500/24 dark:group-hover:text-red-300">
                        <LogOut className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-700 dark:text-red-300">Sign Out</p>
                        <p className="text-[11px] text-red-700/75 dark:text-red-300/80">End current session</p>
                      </div>
                    </button>
                  </div>
               </div>
            </TabsContent>

            <TabsContent value="security" className="p-8 mt-0 outline-none">
              {/* Security Placeholder */}
              <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Shield className="mb-4 h-12 w-12 text-muted-foreground/70" />
                  <h4 className="text-lg font-medium text-foreground">Security & Privacy</h4>
                  <p className="mt-1 max-w-[300px] text-sm text-muted-foreground">
                    Manage your password, two-factor authentication, and active sessions.
                  </p>
                  <Button variant="outline" className="mt-6 border-border hover:bg-muted">
                    Go to Security Settings
                  </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-border/80 bg-muted/40 px-8 py-4">
           <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">BabaBuilds ERP Core</p>
           <p className="text-[10px] text-muted-foreground">v2.4.0-stable</p>
        </div>
      </div>
    </DialogContent>
  );
}

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
import { SheetContent } from '@/components/ui/sheet';
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
            className="h-11 w-11 rounded-lg text-zinc-400 hover:bg-indigo-500/20 hover:text-indigo-300 md:h-8 md:w-8"
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
          className="h-11 w-11 rounded-lg text-zinc-400 hover:bg-emerald-500/20 hover:text-emerald-300 md:h-8 md:w-8"
          title="Mark as Read"
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

interface CommsHubInnerProps {
  session: {
    name?: string | null;
    email?: string | null;
  };
  notifications: InAppNotification[];
  unreadCount: number;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
  isMobile: boolean;
}

function CommsHubInner({
  session,
  notifications,
  unreadCount,
  markRead,
  markAllRead,
  isMobile,
}: CommsHubInnerProps) {
  const tabTriggerClasses = cn(
    'group rounded-none border-b-2 border-transparent bg-transparent text-zinc-400 transition-all data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:border-indigo-400',
    'min-h-11 px-3 py-2 text-sm md:pb-4 md:px-1',
    isMobile && 'flex-1 min-w-fit justify-center',
  );

  const contentPaddingClasses = isMobile ? 'p-4' : 'p-8';

  return (
    <div className="relative">
      {/* Aesthetic Background Accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-600/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-violet-600/10 blur-[100px]" />

      <DialogHeader className={cn(isMobile ? 'px-4 pt-5 pb-3' : 'px-8 pt-8 pb-4')}>
        <div className={cn('flex items-center', isMobile ? 'gap-2.5' : 'gap-3')}>
          <div
            className={cn(
              'flex items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 shadow-lg shadow-indigo-500/10',
              isMobile ? 'h-10 w-10' : 'h-12 w-12',
            )}
          >
            <Zap className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6')} />
          </div>
          <div className="min-w-0">
            <DialogTitle className={cn('truncate font-bold tracking-tight text-white', isMobile ? 'text-xl' : 'text-2xl')}>
              Comms Hub
            </DialogTitle>
            <DialogDescription className={cn('truncate text-zinc-500', isMobile ? 'text-xs' : undefined)}>
              Unified inbox and account management for {session.name}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <Tabs defaultValue="inbox" className="w-full">
        <div className={cn(isMobile ? 'px-3' : 'px-8')}>
          <TabsList
            className={cn(
              'h-auto w-full justify-start gap-2 rounded-none border-b border-zinc-800/50 bg-transparent p-0',
              isMobile && 'overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-0',
            )}
          >
            <TabsTrigger value="inbox" className={tabTriggerClasses}>
              <div className="flex min-h-11 items-center gap-2 whitespace-nowrap">
                <Bell className="h-4 w-4 shrink-0" />
                <span className={cn(isMobile ? 'text-xs' : undefined)}>Inbox</span>
                {unreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
            </TabsTrigger>
            <TabsTrigger value="account" className={tabTriggerClasses}>
              <div className="flex min-h-11 items-center gap-2 whitespace-nowrap">
                <User className="h-4 w-4 shrink-0" />
                <span className={cn(isMobile ? 'text-xs' : undefined)}>Account</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="security" className={tabTriggerClasses}>
              <div className="flex min-h-11 items-center gap-2 whitespace-nowrap">
                <Shield className="h-4 w-4 shrink-0" />
                <span className={cn(isMobile ? 'text-xs' : undefined)}>Security</span>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className={cn('overflow-y-auto custom-scrollbar', isMobile ? 'max-h-[calc(100dvh-14rem)]' : 'max-h-[60vh]')}>
          <TabsContent value="inbox" className={cn('mt-0 outline-none', contentPaddingClasses)}>
            <div className={cn('mb-6 flex items-center justify-between', isMobile && 'mb-4')}>
              <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">Recent Notifications</h3>
              {notifications.length > 0 && (
                <Button
                  onClick={markAllRead}
                  variant="ghost"
                  size="sm"
                  className="h-11 text-[11px] font-bold uppercase tracking-wider text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 md:h-8"
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
                <p className="mt-1 max-w-[200px] text-sm text-zinc-600">
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

          <TabsContent value="account" className={cn('mt-0 outline-none', contentPaddingClasses)}>
            <div className="grid gap-6">
              {/* User Profile Summary */}
              <div className="flex items-center gap-4 rounded-2xl border border-zinc-800/30 bg-white/[0.03] p-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-xl shadow-indigo-500/20">
                  {session.name?.[0] || 'U'}
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-lg font-bold text-white">{session.name}</h4>
                  <p className="truncate text-sm text-zinc-400">{session.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                      Professional Plan
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Grid */}
              <div className={cn('grid gap-3', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
                <Link href="/settings/profile" className="block">
                  <div className="group flex min-h-11 flex-col gap-3 rounded-2xl border border-zinc-800/30 bg-white/[0.03] p-5 text-left transition-all hover:border-zinc-700/50 hover:bg-white/[0.06]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 transition-colors group-hover:bg-indigo-600/20 group-hover:text-indigo-400">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Profile Settings</p>
                      <p className="text-[11px] text-zinc-500">Manage your personal info</p>
                    </div>
                  </div>
                </Link>
                <Link href="/settings/billing" className="block">
                  <div className="group flex min-h-11 flex-col gap-3 rounded-2xl border border-zinc-800/30 bg-white/[0.03] p-5 text-left transition-all hover:border-zinc-700/50 hover:bg-white/[0.06]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 transition-colors group-hover:bg-indigo-600/20 group-hover:text-indigo-400">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Billing & Plan</p>
                      <p className="text-[11px] text-zinc-500">View invoices & upgrade</p>
                    </div>
                  </div>
                </Link>
                <Link href="/help" className="block">
                  <div className="group flex min-h-11 flex-col gap-3 rounded-2xl border border-zinc-800/30 bg-white/[0.03] p-5 text-left transition-all hover:border-zinc-700/50 hover:bg-white/[0.06]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 transition-colors group-hover:bg-sky-600/20 group-hover:text-sky-400">
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
                  className="group flex min-h-11 flex-col gap-3 rounded-2xl border border-red-900/10 bg-red-500/5 p-5 text-left transition-all hover:border-red-500/30 hover:bg-red-500/10"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 transition-colors group-hover:bg-red-600/20 group-hover:text-red-400">
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

          <TabsContent value="security" className={cn('mt-0 outline-none', contentPaddingClasses)}>
            {/* Security Placeholder */}
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="mb-4 h-12 w-12 text-zinc-700" />
              <h4 className="text-lg font-medium text-zinc-300">Security & Privacy</h4>
              <p className="mt-1 max-w-[300px] text-sm text-zinc-600">
                Manage your password, two-factor authentication, and active sessions.
              </p>
              <Button variant="outline" className="mt-6 h-11 border-zinc-800 hover:bg-white/5">
                Go to Security Settings
              </Button>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer info */}
      <div className={cn('flex items-center justify-between border-t border-zinc-800/50 bg-white/[0.02]', isMobile ? 'px-4 py-3' : 'px-8 py-4')}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">BabaBuilds ERP Core</p>
        <p className="text-[10px] text-zinc-600">v2.4.0-stable</p>
      </div>
    </div>
  );
}

export function CommsHub() {
  const { data: session } = useSession();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const isMobile = useIsMobile();
  const preferBottomSheet = true;
  const mobileSheetSide: 'bottom' | 'right' = preferBottomSheet ? 'bottom' : 'right';

  if (!session?.user) return null;

  const sharedContent = (
    <CommsHubInner
      session={session.user}
      notifications={notifications}
      unreadCount={unreadCount}
      markRead={markRead}
      markAllRead={markAllRead}
      isMobile={isMobile}
    />
  );

  if (isMobile) {
    return (
      <SheetContent
        side={mobileSheetSide}
        className={cn(
          'border-zinc-800/50 bg-zinc-950/95 p-0 shadow-2xl backdrop-blur-2xl overflow-hidden',
          mobileSheetSide === 'bottom' && 'max-h-[90dvh] rounded-t-3xl border-x border-t',
          mobileSheetSide === 'right' && 'w-full max-w-none border-l',
        )}
      >
        {sharedContent}
      </SheetContent>
    );
  }

  return (
    <DialogContent className="max-w-2xl border-zinc-800/50 bg-zinc-950/90 p-0 shadow-2xl backdrop-blur-2xl sm:rounded-3xl overflow-hidden">
      {sharedContent}
    </DialogContent>
  );
}

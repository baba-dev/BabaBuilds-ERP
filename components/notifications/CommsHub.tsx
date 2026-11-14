'use client';

import * as React from 'react';
import { useNotificationsContext } from '@/components/notifications/notifications-context';
import {
  Bell,
  Check,
  CheckCheck,
  CreditCard,
  ExternalLink,
  Inbox,
  LifeBuoy,
  LogOut,
  MonitorSmartphone,
  User,
  Zap,
} from 'lucide-react';
import { ConnectDeviceTab } from './ConnectDeviceTab';
import { cn } from '@/lib/utils';
import type { InAppNotification } from '@prisma/client';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';

const EVENT_ICON: Record<string, string> = {
  INVOICE_GENERATED: '🧾',
  INVOICE_PAID: '✅',
  PAYMENT_REMINDER: '⏰',
  CLIENT_ADDED: '🤝',
  PROPOSAL_CREATED: '📄',
  PROPOSAL_VIEWED: '👀',
  SERVICE_CREATED: '🔧',
  RENEWAL_ALERT: '🔄',
  BILLING_FAILED: '⚠️',
  DEADLINE_ALERT: '⚠️',
  TAX_ALERT: '🏛️',
  SHOP_ORDER_CREATED: '🛒',
  SHOP_ORDER_UPDATED: '📝',
  SHOP_ORDER_DELETED: '🗑️',
  SHOP_ORDER_STATUS_CHANGED: '📦',
  LEAVE_REQUEST_SUBMITTED: '🗓️',
  LEAVE_APPROVED: '✅',
  LEAVE_REJECTED: '❌',
};

const EVENT_ACCENT: Record<string, string> = {
  INVOICE_GENERATED: 'border-l-indigo-500',
  INVOICE_PAID: 'border-l-emerald-500',
  PAYMENT_REMINDER: 'border-l-amber-500',
  CLIENT_ADDED: 'border-l-sky-500',
  PROPOSAL_CREATED: 'border-l-violet-500',
  PROPOSAL_VIEWED: 'border-l-fuchsia-500',
  SERVICE_CREATED: 'border-l-cyan-500',
  RENEWAL_ALERT: 'border-l-purple-500',
  BILLING_FAILED: 'border-l-rose-500',
  DEADLINE_ALERT: 'border-l-red-500',
  TAX_ALERT: 'border-l-blue-500',
  SHOP_ORDER_CREATED: 'border-l-emerald-500',
  SHOP_ORDER_UPDATED: 'border-l-indigo-500',
  SHOP_ORDER_DELETED: 'border-l-zinc-500',
  SHOP_ORDER_STATUS_CHANGED: 'border-l-amber-500',
  LEAVE_REQUEST_SUBMITTED: 'border-l-sky-500',
  LEAVE_APPROVED: 'border-l-emerald-500',
  LEAVE_REJECTED: 'border-l-rose-500',
};

interface NotificationItemProps {
  notification: InAppNotification;
  onRead: (id: string) => void;
}

const typography = {
  title: 'text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100',
  subtitle: 'text-sm text-zinc-600 dark:text-zinc-400',
  metadata: 'text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500',
};

const cardSurfaceClass =
  'rounded-2xl border border-zinc-200/70 bg-white/90 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/55 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]';

const iconContainerClass =
  'flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-zinc-900 dark:text-zinc-300 dark:group-hover:bg-indigo-600/20 dark:group-hover:text-indigo-300';

const badgeClass =
  'inline-flex items-center rounded-full border border-zinc-300/80 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:border-zinc-700/70 dark:bg-zinc-800/70 dark:text-zinc-300';

function NotificationItem({ notification: n, onRead }: NotificationItemProps) {
  const accent = EVENT_ACCENT[n.eventType] ?? 'border-l-zinc-500';
  const icon = EVENT_ICON[n.eventType] ?? '🔔';
  const ago = formatDistanceToNow(new Date(n.createdAt), { addSuffix: true });

  return (
    <div
      className={cn(
        'group relative flex gap-4 rounded-xl border border-border/60 border-l-4 bg-muted/40 p-4 transition-all hover:bg-muted',
        accent,
      )}
    >
      <div className="flex-shrink-0">
        <div className={cn(iconContainerClass, 'shadow-inner')}>
          <span className="text-xl leading-none">{icon}</span>
        </div>
      </div>

      <div className="min-w-0 flex flex-1 flex-col justify-center">
        <p className="text-sm font-semibold leading-tight text-foreground transition-colors">{n.title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
        <p className={cn(typography.metadata, 'mt-2')}>{ago}</p>
      </div>

      <div className="flex w-12 flex-shrink-0 flex-col items-center justify-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        {n.actionUrl && (
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="h-9 w-9 touch-manipulation rounded-lg text-zinc-500 hover:bg-indigo-100 hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-zinc-400 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-300 dark:focus-visible:ring-offset-zinc-950"
            title="View Details"
          >
            <a href={n.actionUrl} onClick={() => onRead(n.id)}>
              <ExternalLink className="h-4 w-4" />
              <span className="sr-only">View notification details</span>
            </a>
          </Button>
        )}
        {!n.actionUrl && <div className="h-9 w-9" aria-hidden="true" />}
        <Button
          onClick={() => onRead(n.id)}
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-9 w-9 touch-manipulation rounded-lg text-zinc-500 hover:bg-emerald-100 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-zinc-400 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300 dark:focus-visible:ring-offset-zinc-950"
          title="Mark as Read"
        >
          <Check className="h-4 w-4" />
          <span className="sr-only">Mark notification as read</span>
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
    'group rounded-none border-b-2 border-transparent bg-transparent text-zinc-400 transition-all data-[state=active]:bg-transparent data-[state=active]:border-indigo-400 data-[state=active]:text-indigo-400',
    'min-h-11 px-3 py-2 text-sm md:pb-4 md:px-1',
    isMobile && 'flex-1 min-w-fit justify-center',
  );

  const contentPaddingClasses = isMobile ? 'p-4' : 'p-8';

  return (
    <div className="relative min-w-0">
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-600/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-violet-600/10 blur-[100px]" />

      <DialogHeader className={cn(isMobile ? 'px-4 pt-5 pb-3' : 'px-8 pt-8 pb-4')}>
        <div className={cn('flex items-center', isMobile ? 'gap-2.5' : 'gap-3')}>
          <div
            className={cn(
              'flex items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-lg shadow-indigo-500/10 dark:bg-indigo-600/20 dark:text-indigo-400',
              isMobile ? 'h-10 w-10' : 'h-12 w-12',
            )}
          >
            <Zap className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6')} />
          </div>
          <div>
            <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Comms Hub</DialogTitle>
            <DialogDescription className="text-sm text-zinc-600 dark:text-zinc-400">
              Updates on billing, clients, and account activity.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <Tabs defaultValue="inbox" className="min-w-0 w-full">
        <div className={cn(isMobile ? 'px-4' : 'px-8')}>
          <TabsList className="h-auto w-full justify-start gap-8 rounded-none border-b border-zinc-200/80 bg-transparent p-0 dark:border-zinc-800/50">
            <TabsTrigger value="inbox" className={tabTriggerClasses}>
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
            <TabsTrigger value="account" className={tabTriggerClasses}>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>Account</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="connect" className={tabTriggerClasses}>
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4" />
                <span>Connect Device</span>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="@container min-w-0 max-h-[60dvh] overflow-x-hidden overflow-y-auto custom-scrollbar">
          <TabsContent value="inbox" className={cn('mt-0 space-y-6 outline-none', contentPaddingClasses)}>
            <div className="flex items-center justify-between">
              <h3 className={typography.metadata}>Recent Notifications</h3>
              {notifications.length > 0 && (
                <Button
                  onClick={markAllRead}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px] font-bold uppercase tracking-wider text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
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
                <p className={cn(typography.subtitle, 'mt-1 max-w-[220px]')}>
                  You&apos;ve handled all your recent business notifications.
                </p>
              </div>
            ) : (
              <div className={cn(cardSurfaceClass, 'space-y-3 p-4')}>
                {notifications.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={(id) => markRead([id])} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="account" className={cn('mt-0 space-y-6 outline-none', contentPaddingClasses)}>
            <div className="grid gap-6">
              <div className={cn(cardSurfaceClass, 'flex items-center gap-4 p-5')}>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-xl shadow-indigo-500/20">
                  {session.name?.[0] || 'U'}
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-lg font-bold text-zinc-900 dark:text-white">{session.name}</h4>
                  <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">{session.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={cn(badgeClass, 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300')}>
                      Professional Plan
                    </span>
                  </div>
                </div>
              </div>

              <Separator className="bg-zinc-800/70" />

              <div className="grid grid-cols-2 gap-3">
                <Link href="/settings/profile" className="block">
                  <div className={cn(cardSurfaceClass, 'group flex flex-col gap-3 p-5 text-left transition-all hover:border-zinc-300/90 hover:bg-zinc-100/80 dark:hover:border-zinc-700/80 dark:hover:bg-zinc-900/70')}>
                    <div className={iconContainerClass}>
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={cn(typography.subtitle, 'font-semibold text-zinc-900 dark:text-zinc-100')}>Profile Settings</p>
                      <p className={typography.metadata}>Manage your personal info</p>
                    </div>
                  </div>
                </Link>
                <Link href="/settings/billing" className="block">
                  <div className={cn(cardSurfaceClass, 'group flex flex-col gap-3 p-5 text-left transition-all hover:border-zinc-300/90 hover:bg-zinc-100/80 dark:hover:border-zinc-700/80 dark:hover:bg-zinc-900/70')}>
                    <div className={iconContainerClass}>
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={cn(typography.subtitle, 'font-semibold text-zinc-900 dark:text-zinc-100')}>Billing &amp; Plan</p>
                      <p className={typography.metadata}>View invoices &amp; upgrade</p>
                    </div>
                  </div>
                </Link>
                <Link href="/help" className="block">
                  <div className={cn(cardSurfaceClass, 'group flex flex-col gap-3 p-5 text-left transition-all hover:border-zinc-300/90 hover:bg-zinc-100/80 dark:hover:border-zinc-700/80 dark:hover:bg-zinc-900/70')}>
                    <div className={cn(iconContainerClass, 'group-hover:bg-sky-600/20 group-hover:text-sky-300')}>
                      <LifeBuoy className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={cn(typography.subtitle, 'font-semibold text-zinc-900 dark:text-zinc-100')}>Help</p>
                      <p className={typography.metadata}>Open /help knowledge base</p>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
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

          <TabsContent value="connect" className={cn('mt-0 outline-none', contentPaddingClasses)}>
            <ConnectDeviceTab />
          </TabsContent>
        </div>
      </Tabs>

      <div className={cn('flex items-center justify-between border-t border-zinc-200/80 bg-zinc-50/80 dark:border-zinc-800/50 dark:bg-white/[0.02]', isMobile ? 'px-4 py-3' : 'px-8 py-4')}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">BabaBuilds ERP Core</p>
        <p className="text-[11px] text-zinc-600">v2.4.0-stable</p>
      </div>
    </div>
  );
}

export function CommsHub() {
  const { data: session } = useSession();
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationsContext();
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
          'overflow-hidden border-zinc-200/70 bg-white/95 p-0 text-zinc-900 shadow-2xl backdrop-blur-2xl dark:border-zinc-800/50 dark:bg-zinc-950/95 dark:text-zinc-100',
          mobileSheetSide === 'bottom' && 'max-h-[90dvh] rounded-t-3xl border-x border-t',
          mobileSheetSide === 'right' && 'w-full max-w-none border-l',
        )}
      >
        {sharedContent}
      </SheetContent>
    );
  }

  return (
    <DialogContent className="max-w-4xl overflow-hidden border-zinc-200/70 bg-white/95 p-0 text-zinc-900 shadow-2xl backdrop-blur-2xl dark:border-zinc-800/50 dark:bg-zinc-950/90 dark:text-zinc-100 sm:rounded-3xl">
      {sharedContent}
    </DialogContent>
  );
}

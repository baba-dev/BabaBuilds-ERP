import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, Info, Mail, Server, Settings, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export function EmailBillingActions({ items }: { items: Array<{ href: string; label: string; primary?: boolean }> }) {
  return <div className="flex flex-wrap items-center gap-2">{items.map((item)=><Button key={item.href} asChild variant={item.primary?'primary-action':'outline'} size="sm"><Link href={item.href}>{item.label}</Link></Button>)}</div>;
}

export function EmailBillingStatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return <Card variant="panel" size="sm"><CardHeader className="gap-1 pb-0"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle></CardHeader>{helper?<CardContent><p className="text-xs text-muted-foreground">{helper}</p></CardContent>:null}</Card>;
}

const toneByStatus: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Info }> = {
  ACTIVE: { variant: 'default', icon: CheckCircle2 }, SUCCESS: { variant: 'default', icon: CheckCircle2 },
  OPEN: { variant: 'secondary', icon: Clock }, INFO: { variant: 'secondary', icon: Info }, RUNNING: { variant: 'secondary', icon: Clock },
  PAUSED: { variant: 'outline', icon: Clock }, REVIEW_REQUIRED: { variant: 'outline', icon: AlertCircle }, WARNING: { variant: 'outline', icon: AlertCircle },
  CANCELLED: { variant: 'destructive', icon: ShieldAlert }, REMOVED: { variant: 'destructive', icon: AlertCircle }, ERROR: { variant: 'destructive', icon: ShieldAlert }, FAILED: { variant: 'destructive', icon: ShieldAlert }, CRITICAL: { variant: 'destructive', icon: ShieldAlert },
  ARCHIVED: { variant: 'outline', icon: Clock }, IGNORED: { variant: 'outline', icon: Info }, DISABLED: { variant: 'outline', icon: Clock }, RESOLVED: { variant: 'default', icon: CheckCircle2 }, DISMISSED: { variant: 'outline', icon: Info },
};
export function EmailBillingStatusBadge({ value, label }: { value?: string | null; label?: string }) { const v=value??'UNKNOWN'; const tone=toneByStatus[v]??{variant:'outline' as const,icon:Info}; const Icon=tone.icon; return <Badge variant={tone.variant} className="gap-1"><Icon aria-hidden className="size-3" />{label??v.replaceAll('_',' ')}</Badge>; }

export function EmailBillingEmptyState({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return <Card variant="quiet"><CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"><div className="rounded-full border border-border/70 bg-muted p-3 text-muted-foreground"><Mail aria-hidden className="size-5" /></div><div><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div>{action?<Button asChild variant="outline" size="sm"><Link href={action.href}>{action.label}</Link></Button>:null}</CardContent></Card>;
}

export function EmailBillingPanel({ title, description, children, icon }: { title: string; description?: string; children: React.ReactNode; icon?: 'server' | 'settings' | 'alert' }) {
  const Icon = icon === 'server' ? Server : icon === 'settings' ? Settings : icon === 'alert' ? AlertCircle : Info;
  return <Card variant="panel"><CardHeader><div className="flex items-start gap-3"><span className="rounded-lg border border-border/70 bg-muted p-2 text-muted-foreground"><Icon aria-hidden className="size-4" /></span><div><CardTitle>{title}</CardTitle>{description?<CardDescription>{description}</CardDescription>:null}</div></div></CardHeader><CardContent>{children}</CardContent></Card>;
}

export function EmailBillingTable({ headers, children, empty, caption }: { headers: string[]; children: React.ReactNode; empty?: React.ReactNode; caption?: string }) {
  return <div className="w-full overflow-x-auto rounded-xl border border-border/70 bg-card" role="region" aria-label={caption ?? headers.join(', ')} tabIndex={0}><Table className="min-w-[860px]"><caption className="sr-only">{caption ?? headers.join(', ')}</caption><TableHeader><TableRow>{headers.map((h)=><TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{children || <TableRow><TableCell colSpan={headers.length}>{empty}</TableCell></TableRow>}</TableBody></Table></div>;
}

export function TruncatedText({ children, className }: { children: string; className?: string }) { return <span className={cn('block max-w-[16rem] truncate', className)} title={children}>{children}</span>; }

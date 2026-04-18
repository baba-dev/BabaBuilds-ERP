import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Moon, Sun, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { typography } from "@/lib/ui/typography";
import { cn } from "@/lib/utils";

function ThemePanel({ title, icon, className }: { title: string; icon: ReactNode; className?: string }) {
  return (
    <Card className={cn("border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>Canonical component and state references for this theme.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className={typography.cardTitle}>Typography roles</h3>
          <p className={typography.bodyCopy}>Body copy uses the semantic baseline for readable long-form content.</p>
          <p className={typography.cardBody}>Helper / supporting text stays legible while visually secondary.</p>
        </section>

        <section className="space-y-3">
          <h3 className={typography.cardTitle}>Badges</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">Warning</Badge>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Success</Badge>
            <Badge variant="destructive">Error</Badge>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className={typography.cardTitle}>Interactive controls</h3>
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Control contrast + focus ring" />
            <Textarea placeholder="Hover/focus/disabled parity" className="min-h-[84px]" />
          </div>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <Checkbox defaultChecked />
              <span>Checkbox</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch defaultChecked />
              <span>Switch</span>
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className={typography.cardTitle}>Key states audit</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/70">
              <p className="mb-2 text-sm font-semibold">Disabled</p>
              <Button disabled variant="outline" className="w-full">Action unavailable</Button>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="size-4" />Error</p>
              <p className="text-xs text-rose-700/90 dark:text-rose-300/90">Invoice code is required before submission.</p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"><TriangleAlert className="size-4" />Warning</p>
              <p className="text-xs text-amber-700/90 dark:text-amber-300/90">Tax period is close to filing deadline.</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />Success</p>
              <p className="text-xs text-emerald-700/90 dark:text-emerald-300/90">Records synced successfully.</p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/70">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Loader2 className="size-4 animate-spin" />Loading</p>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>

            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Empty</p>
              <p className="mt-1">No matching items yet. Add your first item to begin.</p>
              <Button variant="outline" size="sm" className="mt-3">Create item</Button>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

export default function AdminStyleGalleryPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className={typography.pageTitle}>Style baseline gallery</h1>
        <p className={typography.bodyCopy}>
          Internal reference for contrast, focus visibility, state consistency, and approved typography roles.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ThemePanel title="Light theme reference" icon={<Sun className="size-4" />} />
        <div className="dark">
          <ThemePanel title="Dark theme reference" icon={<Moon className="size-4" />} className="bg-zinc-950 text-zinc-50" />
        </div>
      </div>
    </div>
  );
}

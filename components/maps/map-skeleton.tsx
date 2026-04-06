import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function MapCardSkeleton() {
  return (
    <Card className="border-zinc-200/90 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <CardHeader className="space-y-2 pb-3">
        <div className="h-4 w-52 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3 w-72 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-56 w-full animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
      </CardContent>
    </Card>
  );
}

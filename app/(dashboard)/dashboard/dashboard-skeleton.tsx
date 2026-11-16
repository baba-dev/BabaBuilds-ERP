import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-muted/70", className)} />;
}

/** Mirrors the loaded layout so nothing jumps when the numbers arrive. */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Block className="h-[92px]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-[150px] sm:h-[164px]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-[88px]" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Block className="h-[360px] lg:col-span-2" />
        <Block className="h-[360px]" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-[230px]" />
        ))}
      </div>
    </div>
  );
}

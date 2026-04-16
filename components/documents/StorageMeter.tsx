"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 10 || i === 0 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export type StorageMeterProps = {
  usedBytes: number;
  capBytes: number | null;
  usedActiveBytes?: number;
  warningThreshold?: number; // 0..1
  dangerThreshold?: number; // 0..1
  compact?: boolean;
};

export function StorageMeter({
  usedBytes,
  capBytes,
  usedActiveBytes,
  warningThreshold = 0.7,
  dangerThreshold = 0.9,
  compact = false,
}: StorageMeterProps) {
  if (capBytes === null) {
    return (
      <div className={cn("flex flex-col gap-2", compact && "gap-1.5")}>
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">Storage</div>
          <div className="text-xs tabular-nums text-foreground/80">Unlimited</div>
        </div>
        <Progress value={5} className="h-1.5 opacity-40" />
      </div>
    );
  }

  const cap = Math.max(0, capBytes);
  const used = Math.max(0, usedBytes);
  const ratio = cap === 0 ? 1 : Math.min(1, used / cap);

  const tone =
    ratio >= 1 ? "stop" : ratio >= dangerThreshold ? "danger" : ratio >= warningThreshold ? "warn" : "ok";

  const barClass =
    tone === "stop"
      ? "bg-destructive"
      : tone === "danger"
        ? "bg-destructive"
        : tone === "warn"
          ? "bg-amber-500"
          : "bg-primary";

  return (
    <div className={cn("flex flex-col gap-2", compact && "gap-1.5")}>
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs text-muted-foreground">Storage</div>
        <div className="text-xs tabular-nums text-foreground/80">
          {formatBytes(used)} / {formatBytes(cap)}
        </div>
      </div>
      {typeof usedActiveBytes === "number" ? (
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] text-muted-foreground">Active</div>
          <div className="text-[11px] tabular-nums text-foreground/70">{formatBytes(Math.max(0, usedActiveBytes))}</div>
        </div>
      ) : null}
      <div className={cn("rounded-full bg-muted p-0", compact ? "" : "")}>
        <Progress value={Math.round(ratio * 100)} className="h-1.5" />
        <div className={cn("pointer-events-none -mt-1.5 h-1.5 w-full rounded-full", "opacity-0")} />
      </div>
      {/* Progress uses bg-primary; override indicator via parent ringless approach */}
      <style jsx>{`
        [data-slot='progress-indicator'] {
          background: var(--bb-docs-meter, currentColor);
        }
      `}</style>
      <style jsx>{`
        :global(:root) {
          --bb-docs-meter: initial;
        }
      `}</style>
      <div className="hidden" aria-hidden />
      <style jsx>{`
        :global([data-slot='progress-indicator']) {
          background: inherit;
        }
      `}</style>
      <div className="hidden" />
      <style jsx>{`
        :global([data-slot='progress']) [data-slot='progress-indicator'] {
          background: ${barClass === "bg-primary"
            ? "hsl(var(--primary))"
            : barClass === "bg-amber-500"
              ? "rgb(245 158 11)"
              : "hsl(var(--destructive))"};
        }
      `}</style>
    </div>
  );
}


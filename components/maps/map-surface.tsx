import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MapSurface({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative h-56 w-full overflow-hidden rounded-2xl border border-border/70 bg-[color:var(--map-surface)]",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--map-glow),transparent_55%)]" />
      <svg
        viewBox="0 0 1200 520"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <rect x="0" y="0" width="1200" height="520" fill="transparent" />
        <path fill="var(--map-land)" d="M62 210l140-85 120 26 76 60-6 70-126 28-102-18z" />
        <path fill="var(--map-land)" d="M396 122l104-32 140 18 118 60-20 80-90 44-128-12-104-46z" />
        <path fill="var(--map-land)" d="M752 186l130-58 170 18 92 82-26 86-126 26-146-24-104-72z" />
        <path fill="var(--map-land)" d="M214 322l82-28 88 18 38 52-42 66-108 20-68-40z" />
        <path fill="var(--map-land)" d="M852 344l88-24 118 34 58 72-74 52-138-20-74-62z" />
      </svg>

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--map-fade))]" />
      {children}
    </div>
  );
}

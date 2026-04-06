import type { MapPoint } from "@/components/maps/types";

export function MapPopup({ point }: { point: MapPoint | null }) {
  if (!point) {
    return (
      <div className="rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
        Hover over a marker to inspect activity and distribution signals.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm">
      <p className="text-xs font-semibold text-foreground">{point.label}</p>
      {point.subtitle ? <p className="text-[11px] text-muted-foreground">{point.subtitle}</p> : null}
      <p className="mt-1 text-xs font-semibold text-[color:var(--map-marker-strong)]">{point.value}</p>
    </div>
  );
}

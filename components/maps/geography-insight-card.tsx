"use client";

import { useMemo, useState } from "react";
import { Globe, Layers3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapMarkers } from "@/components/maps/map-markers";
import { MapPopup } from "@/components/maps/map-popup";
import { MapSurface } from "@/components/maps/map-surface";
import type { MapPoint } from "@/components/maps/types";

export function GeographyInsightCard({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: MapPoint[];
}) {
  const [activePoint, setActivePoint] = useState<MapPoint | null>(null);

  const aggregate = useMemo(() => {
    return {
      locations: points.length,
      totalWeight: points.reduce((sum, point) => sum + (point.weight ?? 0), 0),
    };
  }, [points]);

  return (
    <Card className="border-zinc-200/90 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
          <Globe className="h-4 w-4 text-[color:var(--map-marker-strong)]" />
          {title}
        </CardTitle>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <MapSurface>
          <MapMarkers points={points} activeId={activePoint?.id} onHover={setActivePoint} />
        </MapSurface>
        <div className="flex items-start justify-between gap-3">
          <MapPopup point={activePoint} />
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-right">
            <Layers3 className="h-4 w-4 text-[color:var(--map-marker)]" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coverage</p>
              <p className="text-xs font-semibold text-foreground">{aggregate.locations} jurisdictions · {aggregate.totalWeight}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

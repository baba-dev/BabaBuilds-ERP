"use client";

import { useMemo } from "react";
import type { ClusterPoint, MapPoint } from "@/components/maps/types";
import { cn } from "@/lib/utils";

const CLUSTER_DISTANCE = 8;

function clusterPoints(points: MapPoint[]): ClusterPoint[] {
  const clusters: ClusterPoint[] = [];

  for (const point of points) {
    const nearby = clusters.find((cluster) => {
      const distance = Math.hypot(cluster.x - point.x, cluster.y - point.y);
      return distance <= CLUSTER_DISTANCE;
    });

    if (!nearby) {
      clusters.push({
        id: `cluster-${point.id}`,
        x: point.x,
        y: point.y,
        count: 1,
        points: [point],
      });
      continue;
    }

    nearby.points.push(point);
    nearby.count += 1;
    nearby.x = nearby.points.reduce((sum, entry) => sum + entry.x, 0) / nearby.count;
    nearby.y = nearby.points.reduce((sum, entry) => sum + entry.y, 0) / nearby.count;
  }

  return clusters;
}

export function MapMarkers({
  points,
  activeId,
  onHover,
}: {
  points: MapPoint[];
  activeId?: string | null;
  onHover?: (point: MapPoint | null) => void;
}) {
  const clusters = useMemo(() => clusterPoints(points), [points]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {clusters.map((cluster) => {
        const point = cluster.points[0];
        const isCluster = cluster.count > 1;
        const isActive = Boolean(activeId) && cluster.points.some((entry) => entry.id === activeId);

        return (
          <button
            key={cluster.id}
            type="button"
            className={cn(
              "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--map-marker-border)] bg-[color:var(--map-marker)] text-[10px] font-semibold text-white shadow-md transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]",
              isCluster ? "h-8 min-w-8 px-1" : "h-3 w-3",
              isActive && "scale-110 bg-[color:var(--map-marker-strong)]"
            )}
            style={{ left: `${cluster.x}%`, top: `${cluster.y}%` }}
            onMouseEnter={() => onHover?.(point)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(point)}
            onBlur={() => onHover?.(null)}
            aria-label={isCluster ? `${cluster.count} locations` : point.label}
          >
            {isCluster ? cluster.count : null}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClusterPoint, MapPoint } from "@/components/maps/types";
import { cn } from "@/lib/utils";

const CLUSTER_DISTANCE_PX = 30;

type ProjectedPoint = {
  point: MapPoint;
  x: number;
  y: number;
};

function toLatLng(point: MapPoint): { lat: number; lng: number } {
  if ("lat" in point && "lng" in point) {
    return { lat: point.lat, lng: point.lng };
  }

  // Migration fallback for legacy point data encoded as percentages.
  return {
    lat: 90 - point.y * 1.8,
    lng: point.x * 3.6 - 180,
  };
}

function projectToPixels(
  point: MapPoint,
  viewport: { width: number; height: number }
): { x: number; y: number } {
  const { lat, lng } = toLatLng(point);
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const normalizedLng = ((lng + 180) % 360 + 360) % 360 - 180;

  const x = ((normalizedLng + 180) / 360) * viewport.width;
  const y = ((90 - clampedLat) / 180) * viewport.height;

  return { x, y };
}

function clusterPoints(points: ProjectedPoint[]): ClusterPoint[] {
  const clusters: ClusterPoint[] = [];

  for (const projected of points) {
    const nearby = clusters.find((cluster) => {
      const distance = Math.hypot(cluster.x - projected.x, cluster.y - projected.y);
      return distance <= CLUSTER_DISTANCE_PX;
    });

    if (!nearby) {
      clusters.push({
        id: `cluster-${projected.point.id}`,
        x: projected.x,
        y: projected.y,
        count: 1,
        points: [projected.point],
      });
      continue;
    }

    nearby.points.push(projected.point);
    nearby.count += 1;
    nearby.x = nearby.x + (projected.x - nearby.x) / nearby.count;
    nearby.y = nearby.y + (projected.y - nearby.y) / nearby.count;
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });

  useEffect(() => {
    if (!rootRef.current) return;

    const update = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      setViewport({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(rootRef.current);

    return () => observer.disconnect();
  }, []);

  const clusters = useMemo(() => {
    const projectedPoints = points.map((point) => {
      const projected = projectToPixels(point, viewport);
      return {
        point,
        x: projected.x,
        y: projected.y,
      };
    });

    return clusterPoints(projectedPoints);
  }, [points, viewport]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
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
            style={{ left: `${cluster.x}px`, top: `${cluster.y}px` }}
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

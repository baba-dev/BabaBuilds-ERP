"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Position = [number, number];

type Feature = {
  geometry?: {
    type?: "Polygon" | "MultiPolygon";
    coordinates?: Position[][] | Position[][][];
  };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

const WORLD_GEOJSON: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-168, 72],
            [-142, 70],
            [-125, 55],
            [-116, 40],
            [-100, 25],
            [-90, 18],
            [-84, 14],
            [-78, 10],
            [-92, 8],
            [-108, 15],
            [-120, 24],
            [-130, 35],
            [-145, 55],
            [-160, 65],
            [-168, 72],
          ],
        ],
      },
    },
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-82, 12],
            [-70, 9],
            [-60, 4],
            [-53, -10],
            [-56, -28],
            [-64, -40],
            [-72, -52],
            [-76, -40],
            [-78, -22],
            [-80, -5],
            [-82, 12],
          ],
        ],
      },
    },
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-12, 72],
            [20, 71],
            [46, 65],
            [74, 58],
            [102, 50],
            [128, 44],
            [150, 50],
            [162, 56],
            [168, 44],
            [144, 30],
            [120, 24],
            [104, 18],
            [90, 10],
            [80, 6],
            [72, 10],
            [64, 18],
            [56, 24],
            [44, 30],
            [32, 34],
            [22, 30],
            [12, 20],
            [2, 10],
            [-6, 20],
            [-12, 36],
            [-12, 72],
          ],
        ],
      },
    },
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-20, 36],
            [2, 36],
            [16, 30],
            [26, 20],
            [34, 6],
            [38, -8],
            [34, -22],
            [28, -34],
            [18, -36],
            [8, -30],
            [2, -22],
            [-4, -8],
            [-8, 6],
            [-14, 18],
            [-20, 36],
          ],
        ],
      },
    },
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [112, -12],
            [130, -10],
            [146, -18],
            [152, -28],
            [146, -40],
            [130, -42],
            [116, -34],
            [112, -22],
            [112, -12],
          ],
        ],
      },
    },
  ],
};

function toSvgPoint([longitude, latitude]: Position) {
  const x = ((longitude + 180) / 360) * 1200;
  const y = ((90 - latitude) / 180) * 520;
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function geometryToPaths(feature: Feature) {
  if (!feature.geometry?.type || !feature.geometry.coordinates) {
    return [];
  }

  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as Position[][]]
      : (feature.geometry.coordinates as Position[][][]);

  return polygons
    .map((ringSet) => {
      const outerRing = ringSet[0];
      if (!outerRing || outerRing.length < 3) {
        return null;
      }

      const [first, ...rest] = outerRing;
      const start = `M ${toSvgPoint(first)}`;
      const lines = rest.map((point) => `L ${toSvgPoint(point)}`).join(" ");
      return `${start} ${lines} Z`;
    })
    .filter((path): path is string => Boolean(path));
}

export function MapSurface({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const landPaths = useMemo(
    () => WORLD_GEOJSON.features.flatMap((feature) => geometryToPaths(feature)),
    []
  );

  const mapUnavailable = landPaths.length === 0;

  return (
    <div
      className={cn(
        "relative h-56 w-full overflow-hidden rounded-2xl border border-border/70 bg-[color:var(--map-surface)]",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--map-glow),transparent_55%)]" />

      {mapUnavailable ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground">
          Map unavailable
        </div>
      ) : (
        <svg
          viewBox="0 0 1200 520"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <rect x="0" y="0" width="1200" height="520" fill="transparent" />
          {landPaths.map((path, index) => (
            <path key={index} fill="var(--map-land)" d={path} />
          ))}
        </svg>
      )}

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--map-fade))]" />
      {children}
    </div>
  );
}

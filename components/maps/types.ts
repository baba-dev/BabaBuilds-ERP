export type LegacyMapPoint = {
  x: number; // 0-100
  y: number; // 0-100
};

export type GeoMapPoint = {
  lat: number;
  lng: number;
};

export type MapPoint = {
  id: string;
  label: string;
  subtitle?: string;
  value: string;
  weight?: number;
} & (GeoMapPoint | LegacyMapPoint);

export type ClusterPoint = {
  id: string;
  x: number;
  y: number;
  count: number;
  points: MapPoint[];
};

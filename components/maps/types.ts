export type MapPoint = {
  id: string;
  label: string;
  subtitle?: string;
  value: string;
  x: number; // 0-100
  y: number; // 0-100
  weight?: number;
};

export type ClusterPoint = {
  id: string;
  x: number;
  y: number;
  count: number;
  points: MapPoint[];
};

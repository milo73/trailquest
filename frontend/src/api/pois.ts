import { apiFetch } from "./client";
import type { GeoPoint, POI } from "./types";

export const getPois = ({ lat, lon, distance_km = 5 }: { lat: number; lon: number; distance_km?: number }) =>
  apiFetch<POI[]>(`/pois?lat=${lat}&lon=${lon}&distance_km=${distance_km}`);

export type { GeoPoint };

import { apiFetch } from "./client";
import type { GeoPoint, RouteMeasureResult } from "./types";

export const measureRoute = (body: { start: GeoPoint; points: GeoPoint[] }) =>
  apiFetch<RouteMeasureResult>("/routes/measure", { method: "POST", body: JSON.stringify(body) });

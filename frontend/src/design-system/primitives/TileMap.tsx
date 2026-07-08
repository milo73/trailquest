import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "../../api/types";

export interface TileStop {
  order: number;
  label: string;
  lat: number;
  lon: number;
}

function stopIcon(label: string, active: boolean): L.DivIcon {
  const isStart = label === "S";
  const bg = active ? "#b5453a" : isStart ? "#283a5e" : "#ffffff";
  const fg = active || isStart ? "#ffffff" : "#283a5e";
  const size = active ? 34 : 24;
  return L.divIcon({
    className: "tq-tilepin",
    html:
      `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};` +
      `border:2px solid #b5453a;display:flex;align-items:center;justify-content:center;` +
      `font:700 12px/1 'DM Sans',sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "tq-userdot",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#283a5e;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  // Key on the coordinates' content, not the (freshly-built each render) array
  // identity — otherwise the effect re-fits on every render and fights the
  // user's pan/zoom on the live map.
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [30, 30] });
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function TileMap({
  stops,
  routeGeometry,
  activeOrder,
  showUserDot = false,
}: {
  stops: TileStop[];
  routeGeometry?: GeoPoint[] | null;
  activeOrder?: number;
  showUserDot?: boolean;
}) {
  const pts: [number, number][] = stops.map((s) => [s.lat, s.lon]);
  const line: [number, number][] =
    routeGeometry && routeGeometry.length ? routeGeometry.map((g) => [g.lat, g.lon]) : pts;
  const center: [number, number] = pts[0] ?? [52.3812, 4.6361];
  const active = stops.find((s) => s.order === activeOrder);
  return (
    <MapContainer
      center={center}
      zoom={14}
      // position+zIndex create a stacking context so Leaflet's internal
      // z-indexes (panes 400-700, controls 1000) stay INSIDE the map and
      // can't paint over page modals (which sit at z-index ~200).
      style={{ width: "100%", height: "100%", position: "relative", zIndex: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={pts} />
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: "#b5453a", weight: 4 }} />}
      {stops.map((s) => (
        <Marker key={s.order} position={[s.lat, s.lon]} icon={stopIcon(s.label, s.order === activeOrder)} />
      ))}
      {showUserDot && active && <Marker position={[active.lat, active.lon]} icon={userIcon()} />}
    </MapContainer>
  );
}

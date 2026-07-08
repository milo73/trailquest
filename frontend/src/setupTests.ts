import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

// Leaflet needs real DOM sizing + network tiles it can't get in jsdom, so mock
// react-leaflet/leaflet: render lightweight DOM that exposes the props tests assert.
vi.mock("leaflet", () => ({
  default: { divIcon: (opts: unknown) => ({ options: opts }) },
  divIcon: (opts: unknown) => ({ options: opts }),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement("div", { "data-testid": "map", style }, children),
  TileLayer: ({ attribution }: { attribution?: string }) =>
    React.createElement("div", { "data-testid": "tile", "data-attribution": attribution }),
  Marker: ({ position, icon }: { position: [number, number]; icon?: { options?: { html?: string } } }) =>
    React.createElement("div", {
      "data-testid": "marker",
      "data-lat": position?.[0],
      "data-lon": position?.[1],
      dangerouslySetInnerHTML: { __html: icon?.options?.html ?? "" },
    }),
  Polyline: ({ positions }: { positions: [number, number][] }) =>
    React.createElement("div", { "data-testid": "polyline", "data-count": positions?.length ?? 0 }),
  useMap: () => ({ fitBounds: () => {}, setView: () => {} }),
}));

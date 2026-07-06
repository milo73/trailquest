# Real map tiles (Leaflet/OSM) + walking-path geometry (design)

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation
**Scope:** Replace the stylized SVG `MapCanvas` with a real Leaflet + OpenStreetMap tile map across
every map surface, and add a real street-following route line by fetching the OSRM route geometry.

## Context

`MapCanvas` (`frontend/src/design-system/primitives/MapCanvas.tsx`) is a shared SVG stand-in rendered
in 4 places: the studio **RouteEditor** (`:583`, already fed real `lat/lon`), the **StopEditor** mini-map
(`:380`, 212×128, coordless stub), and the player **Preview** (`:76`, 270px) + **Navigate** (`:29`,
full-screen in `PhoneFrame`, `activeOrder` + a fake user dot). Only RouteEditor passes real coordinates;
the others pass label-only stubs. The route line is straight segments between stops — **no real walking
geometry exists** anywhere: OSRM is called with `overview=false` (`backend/app/clients/osrm.py:41`) so
only distance/duration come back.

## Locked decisions

- **All map surfaces** get real OSM tiles; the SVG stand-in (`MapCanvas` + `projectStops`) is retired.
- **Real walking path**: add an OSRM geometry fetch; carry an optional `route_geometry` on `Trail`/
  `DraftTrail`. When routing falls back to haversine (no OSRM), `route_geometry` is `null` and the map
  draws straight segments between ordered stops.
- Mandatory OSM **attribution** ("© OpenStreetMap contributors"); OSM's free tiles for now (a commercial
  provider is a later concern).
- Offline-safe tests: **mock `react-leaflet`** (Leaflet can't render in jsdom); backend stays offline.
- Degrade rather than break; UI strings Dutch.

## Backend — route geometry

- **`osrm.py`**: the trip call currently sends `overview=false`. Add `overview=full` + `geometries=geojson`
  and extract `trips[0].geometry.coordinates` (a list of `[lon, lat]` pairs along the streets). Add
  `geometry: list[GeoPoint] | None` to `TripResult` (None if absent/parse fails). Existing `ClientError`
  degrade path unchanged.
- **`schemas.py`**: add `route_geometry: list[GeoPoint] | None = None` to `Trail` and `DraftTrail`
  (additive/back-compat; a `GeoPoint` is `{lat, lon}`).
- **`route_service`**: `_order_and_measure` / `generate_trail` populate `route_geometry` from the OSRM
  `TripResult.geometry` (converting `[lon,lat] → GeoPoint`); `None` on the haversine path.
- **`draft_service`**: `_measure` populates `draft.route_geometry` the same way, so a generated concept
  and any re-measure (reorder/edit) refresh the path. `to_trail` carries `route_geometry` onto the
  published snapshot.
- Persistence is automatic — `route_geometry` is a schema field, so the file/sqlite/published stores
  serialize it. `/routes/measure` stays distance-only (YAGNI).

## Frontend — Leaflet tile map

### New dependencies
`leaflet`, `react-leaflet`, `@types/leaflet` (+ `import "leaflet/dist/leaflet.css"`). Pin versions
compatible with React 18 (react-leaflet v4).

### `TileMap` component (`design-system/primitives/TileMap.tsx`)
Replaces `MapCanvas`. Props:
```ts
{
  stops: { order: number; label: string; lat: number; lon: number }[];
  routeGeometry?: { lat: number; lon: number }[] | null;
  activeOrder?: number;
  showUserDot?: boolean;
  className?: string;   // sizing comes from the container (fills 100%)
}
```
Renders:
- `<MapContainer>` filling its parent (`height/width: 100%`), no default zoom control clutter as needed;
  `<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />`.
- **Fit bounds**: a small `FitBounds` child using `useMap()` to `map.fitBounds()` over the stop points
  (and geometry if present) with padding; recompute when stops/geometry change.
- **Markers**: one `<Marker>` per stop with a Leaflet `divIcon` — numbered label (start = "S"), styled
  with the theme tokens (`--tq-terracotta`, `--tq-navy`, `--tq-white`), an `activeOrder` variant (larger
  + a `tqpulse` ring). Icon HTML built by a small helper (testable).
- **Route line**: a `<Polyline>` — from `routeGeometry` (`[lat,lon]` pairs) when present; otherwise the
  ordered stop points (straight fallback). Terracotta stroke.
- **User marker**: when `showUserDot`, a static "jij" marker at the active stop's location (a distinct
  divIcon). Not live geolocation.

### Wiring the 4 surfaces + retiring the SVG
- **RouteEditor**: swap `MapCanvas` → `TileMap`; pass the existing `mapStops` (already coords) + `draft.route_geometry`.
- **Navigate**: extend `mapStops` to carry `start` + each `stop.poi.location`; pass `trail.route_geometry`,
  `activeOrder={state.currentOrder}`, `showUserDot`.
- **Preview**: extend `mapStops` with coords; pass `trail.route_geometry`.
- **StopEditor**: build `mapStops` from the real draft start + stops (the active stop highlighted via
  `activeOrder`); pass `draft.route_geometry`. (Its 212×128 container stays.)
- Update the `design-system/primitives/index.ts` barrel: export `TileMap`, remove `MapCanvas`. Delete
  `MapCanvas.tsx`. Update the two direct importers (studio screens) + the barrel importers (quester).

## Testing

- **Mock `react-leaflet`** in `src/setupTests.ts` (or a `__mocks__`): `MapContainer`/`TileLayer`/`Marker`/
  `Popup`/`Polyline`/`useMap` render as plain DOM exposing key props (marker `position`, polyline
  `positions`, tile `attribution`) so components mount in jsdom and are assertable. Also stub
  `leaflet` where `divIcon`/`Icon` are used.
- **`TileMap.test.tsx`** (replaces `MapCanvas.test.tsx`): renders a `TileMap` with stops + geometry and
  asserts one marker per stop, the correct labels (S/1/2…), the attribution string present, and that the
  polyline uses `routeGeometry` when given / the stop points when `null`.
- **Screen tests** (RouteEditor/StopEditor/Navigate/Preview) keep passing — they mount the map (now via
  the mock) and assert on surrounding data as before.
- **Backend**: `test_clients.py` — OSRM parses `geometry` from an `overview=full` response into
  `GeoPoint`s (offline `_FakeResponse`); `route_service`/`draft_service` — `route_geometry` is populated
  on the OSRM path and `None` on the haversine/seed path; `to_trail` carries it; a published trail
  round-trips the geometry.

## Out of scope

Live device geolocation (the user marker is static); a commercial/production tile provider (OSM free
tiles + attribution for now — mind the usage policy); animated dashed route line; per-tile caching /
offline map packs; clustering. `/routes/measure` returning geometry (only `Trail`/`DraftTrail` carry it).

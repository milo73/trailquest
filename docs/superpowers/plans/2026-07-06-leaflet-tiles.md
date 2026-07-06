# Leaflet/OSM Tiles + Walking-Path Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG `MapCanvas` with a real Leaflet + OpenStreetMap tile map on every map surface, drawing the actual OSRM walking path.

**Architecture:** OSRM gains a geometry fetch (`overview=full&geometries=geojson`) surfaced as an optional `route_geometry` on `Trail`/`DraftTrail` (`null` on the haversine fallback). A new `TileMap` React component (Leaflet/OSM) replaces `MapCanvas` at all 4 call sites; `react-leaflet` is mocked in tests because Leaflet can't render in jsdom.

**Tech Stack:** Python/FastAPI/Pydantic/httpx/pytest; Vite + React 18 + TypeScript + Vitest + RTL; Leaflet + react-leaflet v4.

## Global Constraints

- `route_geometry: list[GeoPoint] | None` — populated only when the `osrm` routing provider returns a path; **`None` on the haversine/seed fallback** (frontend then draws straight segments between ordered stops).
- OSM tiles require the attribution string **"© OpenStreetMap contributors"** on the `TileLayer`.
- The OSRM client stays domain-free (returns lat/lon tuples, not `GeoPoint`); conversion to `GeoPoint` happens in the services.
- Offline-safe: backend tests mock HTTP via `_FakeResponse`; frontend mocks `react-leaflet`/`leaflet`. Backend CI green (ruff/format/mypy/pytest); frontend suites + typecheck + build green; UI strings Dutch; degrade rather than break.

---

### Task 1: OSRM geometry (client)

**Files:**
- Modify: `backend/app/clients/osrm.py`
- Test: `backend/tests/test_clients.py`

**Interfaces:**
- Produces: `TripResult.geometry: list[tuple[float, float]] | None` (lat,lon); new `RouteResult{distance_km, geometry}`; new `osrm.route(points) -> RouteResult` (fixed-order path).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_clients.py` (reuse `_FakeResponse`; add `osrm` to the `from app.clients import ...` line if not present):
```python
_OSRM_TRIP = {
    "code": "Ok",
    "trips": [{"distance": 1234.0, "geometry": {"type": "LineString",
        "coordinates": [[4.63, 52.38], [4.64, 52.39], [4.65, 52.38]]}}],
    "waypoints": [{"waypoint_index": 0}, {"waypoint_index": 1}, {"waypoint_index": 2}],
}
_OSRM_ROUTE = {
    "code": "Ok",
    "routes": [{"distance": 900.0, "geometry": {"type": "LineString",
        "coordinates": [[4.63, 52.38], [4.64, 52.39]]}}],
}


def test_optimized_loop_parses_geometry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osrm.httpx, "get", lambda *a, **k: _FakeResponse(_OSRM_TRIP))
    trip = osrm.optimized_loop([(52.38, 4.63), (52.39, 4.64), (52.38, 4.65)])
    assert trip.distance_km == 1.23
    assert trip.geometry == [(52.38, 4.63), (52.39, 4.64), (52.38, 4.65)]  # (lat,lon)


def test_route_returns_distance_and_geometry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osrm.httpx, "get", lambda *a, **k: _FakeResponse(_OSRM_ROUTE))
    r = osrm.route([(52.38, 4.63), (52.39, 4.64)])
    assert r.distance_km == 0.9
    assert r.geometry == [(52.38, 4.63), (52.39, 4.64)]


def test_route_raises_client_error_on_http_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osrm.httpx, "get", lambda *a, **k: _FakeResponse({}, status=500))
    with pytest.raises(ClientError):
        osrm.route([(52.38, 4.63), (52.39, 4.64)])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clients.py -k "geometry or route" -q`
Expected: FAIL (`osrm.route` missing; `TripResult` has no `geometry`).

- [ ] **Step 3: Implement**

In `backend/app/clients/osrm.py`: add `geometry` to `TripResult`, a `_geometry` helper, request geometry in `optimized_loop`, and a new `route`:
```python
@dataclass(frozen=True)
class TripResult:
    order: list[int]  # input point indices in optimized visiting order
    distance_km: float
    geometry: list[tuple[float, float]] | None = None  # (lat, lon) along the path


@dataclass(frozen=True)
class RouteResult:
    distance_km: float
    geometry: list[tuple[float, float]] | None  # (lat, lon) along the path


def _geometry(obj: dict) -> list[tuple[float, float]] | None:
    """Extract a GeoJSON LineString as (lat, lon) pairs (OSRM emits [lon, lat])."""
    geo = obj.get("geometry")
    if not isinstance(geo, dict):
        return None
    coords = geo.get("coordinates")
    if not coords:
        return None
    return [(lat, lon) for lon, lat in coords]
```
In `optimized_loop`, change the params to request geometry and set it on the result:
```python
        resp = httpx.get(
            url,
            params={"source": "first", "roundtrip": "true",
                    "overview": "full", "geometries": "geojson"},
            timeout=settings.http_timeout,
        )
        ...
        trip = data["trips"][0]
        order = sorted(range(len(points)), key=lambda i: data["waypoints"][i]["waypoint_index"])
        distance_km = float(trip["distance"]) / 1000.0
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
        raise ClientError(f"OSRM request failed: {exc}") from exc

    return TripResult(order=order, distance_km=round(distance_km, 2), geometry=_geometry(trip))
```
Add `route` (fixed-order path via the `route` service):
```python
def route(points: list[tuple[float, float]]) -> RouteResult:
    """Distance + geometry for ``points`` (lat, lon) in the GIVEN order (no reordering)."""
    if len(points) < 2:
        raise ClientError("need at least two points to route")
    coords = ";".join(f"{lon},{lat}" for lat, lon in points)
    url = f"{settings.osrm_url.rstrip('/')}/route/v1/foot/{coords}"
    try:
        resp = httpx.get(
            url,
            params={"overview": "full", "geometries": "geojson"},
            timeout=settings.http_timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "Ok":
            raise ClientError(f"OSRM returned code={data.get('code')}")
        r = data["routes"][0]
        distance_km = round(float(r["distance"]) / 1000.0, 2)
        geometry = _geometry(r)
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
        raise ClientError(f"OSRM request failed: {exc}") from exc
    return RouteResult(distance_km=distance_km, geometry=geometry)
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clients.py -q && ruff check app && mypy app/clients/osrm.py`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/clients/osrm.py backend/tests/test_clients.py
git commit -m "feat(backend): OSRM route geometry (trip + fixed-order route)"
```

---

### Task 2: `route_geometry` on Trail/DraftTrail + service wiring

**Files:**
- Modify: `backend/app/models/schemas.py` (`Trail`, `DraftTrail`)
- Modify: `backend/app/services/route_service.py` (`_order_and_measure`, `measure_loop`, `generate_trail`)
- Modify: `backend/app/services/draft_service.py` (`_measure`, `to_trail`)
- Modify: any other `measure_loop` caller (e.g. `api/routes.py`)
- Test: `backend/tests/test_route_service.py` (or existing route/draft test files), `backend/tests/test_publish_trail.py`

**Interfaces:**
- Consumes: `osrm.optimized_loop().geometry`, `osrm.route()` (Task 1).
- Produces: `Trail.route_geometry`, `DraftTrail.route_geometry` (`list[GeoPoint] | None`); `measure_loop -> (distance, duration, geometry)`; `_order_and_measure -> (ordered, distance, geometry)`.

- [ ] **Step 1: Write the failing test**

Add (monkeypatch the routing provider + `osrm` so it stays offline):
```python
def test_generate_trail_has_route_geometry_with_osrm(monkeypatch):
    from app.clients import osrm
    from app.clients.osrm import TripResult
    from app.models.schemas import TrailRequest, GeoPoint, Theme
    from app.services import route_service

    monkeypatch.setattr(route_service.settings, "routing_provider", "osrm")
    monkeypatch.setattr(osrm, "optimized_loop",
        lambda pts: TripResult(order=list(range(len(pts))), distance_km=2.0,
                               geometry=[(52.38, 4.63), (52.39, 4.64)]))
    trail = route_service.generate_trail(TrailRequest(start=GeoPoint(lat=52.38, lon=4.63), distance_km=3, theme=Theme.MIXED))
    assert trail.route_geometry is not None
    assert trail.route_geometry[0].lat == 52.38 and trail.route_geometry[0].lon == 4.63


def test_generate_trail_route_geometry_none_on_haversine(monkeypatch):
    from app.models.schemas import TrailRequest, GeoPoint, Theme
    from app.services import route_service
    monkeypatch.setattr(route_service.settings, "routing_provider", "haversine")
    trail = route_service.generate_trail(TrailRequest(start=GeoPoint(lat=52.38, lon=4.63), distance_km=3, theme=Theme.MIXED))
    assert trail.route_geometry is None


def test_to_trail_carries_route_geometry():
    from app.models.schemas import GeoPoint
    from app.services import draft_service
    # reuse the publishable-draft helper in this file; set a geometry then convert
    draft = _draft()  # from test_publish_trail.py
    draft.route_geometry = [GeoPoint(lat=1.0, lon=2.0)]
    assert draft_service.to_trail(draft).route_geometry == [GeoPoint(lat=1.0, lon=2.0)]
```
(Place `test_to_trail_carries_route_geometry` in `test_publish_trail.py` where `_draft()` lives; the two `generate_trail` tests in the route-service test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_publish_trail.py tests/test_route_service.py -q -k "geometry"`
Expected: FAIL (`route_geometry` field missing).

- [ ] **Step 3: Implement**

In `backend/app/models/schemas.py`, add to `Trail` and to `DraftTrail`:
```python
    route_geometry: list[GeoPoint] | None = None
```

In `backend/app/services/route_service.py`:
- `_order_and_measure` returns geometry:
```python
def _order_and_measure(
    start: GeoPoint, selected: list[POI]
) -> tuple[list[POI], float, list[GeoPoint] | None]:
    if not selected:
        return [], 0.0, None
    if settings.routing_provider == "osrm":
        try:
            points = [(start.lat, start.lon), *[(p.location.lat, p.location.lon) for p in selected]]
            trip = osrm.optimized_loop(points)
            ordered = [selected[i - 1] for i in trip.order if i != 0]
            geometry = (
                [GeoPoint(lat=lat, lon=lon) for lat, lon in trip.geometry] if trip.geometry else None
            )
            return ordered, trip.distance_km, geometry
        except ClientError as exc:
            logger.warning("OSRM routing failed (%s); using haversine estimate", exc)
    ordered = _nearest_neighbour_loop(start, selected)
    return ordered, round(_loop_distance_km(start, ordered), 2), None
```
- `generate_trail`: change the unpack and add the field:
```python
    ordered, actual_km, geometry = _order_and_measure(req.start, selected)
    ...
    return Trail(
        ...
        stops=stops,
        attributions=sorted(attributions),
        route_geometry=geometry,
    )
```
- `measure_loop` (fixed order; OSRM `route` when configured, else haversine):
```python
def measure_loop(
    start: GeoPoint, ordered_points: list[GeoPoint]
) -> tuple[float, int, list[GeoPoint] | None]:
    if not ordered_points:
        return 0.0, 0, None
    points = [start, *ordered_points, start]
    distance: float | None = None
    geometry: list[GeoPoint] | None = None
    if settings.routing_provider == "osrm":
        try:
            r = osrm.route([(p.lat, p.lon) for p in points])
            distance = r.distance_km
            geometry = [GeoPoint(lat=lat, lon=lon) for lat, lon in r.geometry] if r.geometry else None
        except ClientError as exc:
            logger.warning("OSRM route failed (%s); using haversine estimate", exc)
    if distance is None:
        distance = round(
            sum(_haversine_km(points[i], points[i + 1]) for i in range(len(points) - 1)), 2
        )
    walk_min = (distance / settings.walking_speed_kmh) * 60
    duration = round(walk_min + len(ordered_points) * settings.minutes_per_stop)
    return distance, duration, geometry
```

In `backend/app/services/draft_service.py` `_measure`:
```python
def _measure(draft: DraftTrail) -> DraftTrail:
    distance, duration, geometry = route_service.measure_loop(
        draft.start, [s.poi.location for s in draft.stops]
    )
    draft.actual_distance_km = distance
    draft.estimated_duration_min = duration
    draft.route_geometry = geometry
    draft.attributions = _attributions(draft.stops)
    return draft
```
In `to_trail`, add `route_geometry=draft.route_geometry` to the `Trail(...)`.

**Update the other `measure_loop` caller:** run `grep -rn "measure_loop" backend/app` and fix any unpack (e.g. `api/routes.py` — `distance, duration, _ = route_service.measure_loop(...)`, ignoring geometry).

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the count. If `ruff format --check .` flags files run `ruff format .`; `ruff check --fix .` for import-sort.

- [ ] **Step 5: Commit**

```bash
git add backend/app backend/tests
git commit -m "feat(backend): route_geometry on Trail/DraftTrail (osrm path; null on haversine)"
```

---

### Task 3: Frontend deps + react-leaflet test mock + TS types

**Files:**
- Modify: `frontend/package.json` (+ lockfile) — add `leaflet`, `react-leaflet`, `@types/leaflet`
- Modify: `frontend/src/setupTests.ts` (mock `react-leaflet` + `leaflet`)
- Modify: `frontend/src/api/types.ts` (`Trail`, `DraftTrail` gain `route_geometry`)

**Interfaces:**
- Produces: the mocked `react-leaflet` (`MapContainer`/`TileLayer`/`Marker`/`Polyline`/`useMap`) rendered as testable DOM; `Trail.route_geometry?`, `DraftTrail.route_geometry?`.

- [ ] **Step 1: Install deps**

Run: `cd frontend && npm install leaflet@^1.9.4 react-leaflet@^4.2.1 @types/leaflet@^1.9.12`
Verify they appear in `package.json`.

- [ ] **Step 2: Add the test mock**

In `frontend/src/setupTests.ts` (a `.ts` file — use `React.createElement`, NOT JSX), add after the existing jest-dom import:
```ts
import React from "react";
import { vi } from "vitest";

// Leaflet needs real DOM sizing + network tiles it can't get in jsdom, so mock
// react-leaflet/leaflet: render lightweight DOM that exposes the props tests assert.
vi.mock("leaflet", () => ({
  default: { divIcon: (opts: unknown) => ({ options: opts }) },
  divIcon: (opts: unknown) => ({ options: opts }),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "map" }, children),
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
```

In `frontend/src/api/types.ts`, add to `Trail` and `DraftTrail`:
```ts
  route_geometry?: GeoPoint[] | null;
```

- [ ] **Step 3: Verify build + suite still green**

Run: `cd frontend && npm run typecheck && npm test && npm run build`
Expected: all green (the mock is inert until a component imports react-leaflet; existing suites unaffected). Report the count. If `leaflet/dist/leaflet.css` import warnings appear later they are non-fatal.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/setupTests.ts frontend/src/api/types.ts
git commit -m "feat(frontend): add leaflet/react-leaflet + test mock + route_geometry type"
```

---

### Task 4: `TileMap` component

**Files:**
- Create: `frontend/src/design-system/primitives/TileMap.tsx`
- Test: `frontend/src/design-system/primitives/TileMap.test.tsx`

**Interfaces:**
- Consumes: mocked `react-leaflet`/`leaflet` (Task 3).
- Produces: `TileMap` (props below), exported for the barrel (Task 5).

- [ ] **Step 1: Write the failing test**

`frontend/src/design-system/primitives/TileMap.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TileMap } from "./TileMap";

const STOPS = [
  { order: 0, label: "S", lat: 52.38, lon: 4.63 },
  { order: 1, label: "1", lat: 52.39, lon: 4.64 },
  { order: 2, label: "2", lat: 52.4, lon: 4.65 },
];

test("renders a marker per stop and an OSM attribution", () => {
  render(<TileMap stops={STOPS} />);
  expect(screen.getAllByTestId("marker")).toHaveLength(3);
  expect(screen.getByTestId("tile").getAttribute("data-attribution")).toMatch(/OpenStreetMap/i);
  // labels live in the divIcon html
  expect(screen.getByText("S")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("polyline uses route geometry when provided", () => {
  render(<TileMap stops={STOPS} routeGeometry={[{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: 5, lon: 6 }, { lat: 7, lon: 8 }]} />);
  expect(screen.getByTestId("polyline").getAttribute("data-count")).toBe("4");
});

test("polyline falls back to the stop points when geometry is null", () => {
  render(<TileMap stops={STOPS} routeGeometry={null} />);
  expect(screen.getByTestId("polyline").getAttribute("data-count")).toBe("3");
});

test("adds a user marker when showUserDot with an active stop", () => {
  render(<TileMap stops={STOPS} activeOrder={1} showUserDot />);
  expect(screen.getAllByTestId("marker")).toHaveLength(4); // 3 stops + user
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- TileMap`
Expected: FAIL (component missing).

- [ ] **Step 3: Implement `TileMap.tsx`**

```tsx
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
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [30, 30] });
  }, [map, points]);
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
    <MapContainer center={center} zoom={14} style={{ width: "100%", height: "100%" }} scrollWheelZoom>
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
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test -- TileMap && npm run typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/primitives/TileMap.tsx frontend/src/design-system/primitives/TileMap.test.tsx
git commit -m "feat(frontend): TileMap (Leaflet/OSM) component"
```

---

### Task 5: Wire the 4 surfaces + retire `MapCanvas`

**Files:**
- Modify: `frontend/src/design-system/primitives/index.ts` (barrel: export `TileMap`, drop `MapCanvas`)
- Modify: `frontend/src/studio/screens/RouteEditor.tsx`, `frontend/src/studio/screens/StopEditor.tsx`
- Modify: `frontend/src/quester/screens/Navigate.tsx`, `frontend/src/quester/screens/Preview.tsx`
- Delete: `frontend/src/design-system/primitives/MapCanvas.tsx`, `frontend/src/design-system/primitives/MapCanvas.test.tsx`

**Interfaces:**
- Consumes: `TileMap` (Task 4), `route_geometry` on the trail/draft (Tasks 2–3).

- [ ] **Step 1: Barrel + delete the SVG**

In `frontend/src/design-system/primitives/index.ts`: replace `export { MapCanvas } from "./MapCanvas";` with `export { TileMap } from "./TileMap";`.
Delete `MapCanvas.tsx` and `MapCanvas.test.tsx` (`git rm`).

- [ ] **Step 2: Wire each surface**

`RouteEditor.tsx` (imports `MapCanvas` directly from `./MapCanvas` → change to `TileMap` from `../../design-system/primitives`; `mapStops` already carries coords):
```tsx
<TileMap stops={mapStops} routeGeometry={draft.route_geometry} />
```
`StopEditor.tsx` (build real coords; highlight the active stop; direct import → barrel `TileMap`):
```tsx
const mapStops = [
  { order: 0, label: "S", lat: draft.start.lat, lon: draft.start.lon },
  ...draft.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
];
...
<TileMap stops={mapStops} routeGeometry={draft.route_geometry} activeOrder={activeStop.order} />
```
`Navigate.tsx` (add coords; keep active + user dot):
```tsx
const mapStops = [
  { order: 0, label: "S", lat: trail.start.lat, lon: trail.start.lon },
  ...trail.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
];
...
<TileMap stops={mapStops} routeGeometry={trail.route_geometry} activeOrder={state.currentOrder} showUserDot />
```
`Preview.tsx` (add coords):
```tsx
const mapStops = [
  { order: 0, label: "S", lat: trail.start.lat, lon: trail.start.lon },
  ...trail.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
];
...
<TileMap stops={mapStops} routeGeometry={trail.route_geometry} />
```
Read each file first to get the exact trail/draft variable in scope (`state.trail`, `draft`, `activeStop`) and the container that wraps the map (leave the containers — they provide the map's size). Remove any now-unused `MapCanvas` imports / `activeOrder={4}` stub / label-only `mapStops`.

- [ ] **Step 3: Run tests + typecheck + build**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all green — the 4 screen tests mount `TileMap` via the mock and assert on surrounding data as before. Report the count. If a screen test asserted SVG map internals (it should not — only `MapCanvas.test.tsx` did), update it. Fix any leftover `MapCanvas` import.

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): plot real tiles on all map surfaces; retire MapCanvas"
```

---

### Task 6: Full verification + README

- [ ] **Backend gate:** `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app` — report count.
- [ ] **Frontend gate:** `cd frontend && npm test && npm run typecheck && npm run build` — report count.
- [ ] **READMEs:** `backend/README.md` — `Trail`/`DraftTrail` carry an optional `route_geometry` (the OSRM walking path via `overview=full`; `null` on the haversine fallback), persisted + carried onto published trails. `frontend/README.md` — the map is now a real Leaflet + OSM tile map (`TileMap`, replacing the SVG `MapCanvas`) on all surfaces, drawing the real route line when available; note OSM attribution + that `react-leaflet` is mocked in tests. Verify against code.
- [ ] Commit `docs: Leaflet/OSM tiles + walking-path geometry`.

## Self-review (completed during planning)

- **Spec coverage:** OSRM geometry (trip + fixed-order route) → T1; `route_geometry` schema + service wiring + `to_trail` → T2; deps + react-leaflet mock + TS types → T3; `TileMap` → T4; wire 4 surfaces + retire `MapCanvas` → T5; verify + docs → T6. Attribution (T4 TileLayer + test), haversine→null (T2 test), persistence (schema field, auto) all covered.
- **Placeholder scan:** T1/T2/T4 carry full code; T3 gives the exact mock; T5 cites each file with the exact JSX + notes reading each for the in-scope trail/draft variable.
- **Type consistency:** `TripResult.geometry`/`RouteResult`/`osrm.route` (T1) consumed by `_order_and_measure`/`measure_loop` (T2); `measure_loop` new 3-tuple return updated at every caller (T2); `route_geometry` identical on backend schema (T2) + TS types (T3); `TileStop`/`TileMap` props (T4) match every call site (T5); the react-leaflet mock's testids (T3) match `TileMap.test` (T4).

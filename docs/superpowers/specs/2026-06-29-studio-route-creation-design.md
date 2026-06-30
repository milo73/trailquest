# Trail Creator — working route creation (`/studio/route`) design

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Scope:** Make studio route creation fully working — a real, persisted, shared trail draft built
from real POIs with live distance — spanning new backend endpoints and a frontend draft store.
Builds on the merged frontend (PR #5) and the existing FastAPI backend.

## 1. Goal

Turn `/studio/route` from a static mock into a working route editor:

- A **shared trail draft** lives across the studio (Route / Stop editors), so clicking a stop opens
  *that* stop, and edits are reflected everywhere.
- **Add real POIs** from the backend POI catalog (not an empty "Nieuwe stop" placeholder).
- **Live distance/duration** recompute as stops change (not a hardcoded "5,2 km").
- **Persist the draft** to the backend so it survives reload and appears on the Dashboard.

Everything works **offline on seed data** (seed POIs + haversine), so tests need no network/keys.

## 2. Decisions (locked)

- **Draft model = separate `DraftTrail` / `DraftStop`** (approach A). A `DraftStop` carries a `POI`
  with **optional** `story`/`question` (filled later in the Stop editor). The player-facing
  `Trail`/`Stop` invariant (every `Stop` has a grounded story + question) is left intact; drafts are
  pre-publication and the player never sees a `DraftTrail`.
- **Backend changes are in scope** (new endpoints + a draft service/store), unlike the MVP studio
  which ran purely on mock data.
- **Frontend stays the single Vite app**; the studio gains a shared draft store mirroring the
  existing quester-store pattern.
- The stylized SVG `MapCanvas` stays (no real map tiles).
- UI strings remain Dutch.

## 3. Scope boundary

**In this iteration:**
- Backend: `GET /pois`, `POST /routes/measure`, `POST/GET/PUT /drafts` (+ `GET /drafts`), a
  `draft_service`, a `DraftStore`, and a public `route_service.measure_loop`.
- Frontend: a shared draft store with debounced autosave + live re-measure; new API clients;
  RouteEditor fully wired; a `PoiPicker`; Dashboard creating + listing real drafts; a **minimal**
  StopEditor change so a clicked stop opens that POI.

**Deferred (fast-follows, explicitly NOT here):**
- Full Stop-editor content authoring + saving story/question to the draft.
- Validation reading real per-stop grounding; publish → moderation.
- Real map-tile geometry; draft delete; multi-user/auth/ownership.

## 4. Backend

### 4.1 Schemas (`backend/app/models/schemas.py`)

```
DraftStop:    order: int; poi: POI; story: str | None = None; question: Question | None = None
DraftStatus:  "concept" | "review" | "published"   (StrEnum)
DraftTrail:   id; title; city; theme; start: GeoPoint;
              requested_distance_km: float; actual_distance_km: float;
              estimated_duration_min: int; stops: list[DraftStop];
              status: DraftStatus = "concept"; attributions: list[str]
DraftCreate:  title: str | None = None; start: GeoPoint; distance_km: float = 5;
              theme: Theme = MIXED; from_concept: bool = False
DraftUpdate:  title: str | None = None; theme: Theme | None = None;
              status: DraftStatus | None = None; stop_poi_ids: list[str] | None = None
RouteMeasureRequest:  start: GeoPoint; points: list[GeoPoint]
RouteMeasureResult:   distance_km: float; duration_min: int
```

`DraftUpdate.stop_poi_ids` is the full ordered list of POI ids the draft should now contain — the
service diffs it against the current stops to add/remove/reorder. This keeps reorder/remove/add as
one idempotent update.

### 4.2 `route_service.measure_loop(start, ordered_points) -> tuple[float, int]`

Public wrapper exposing the existing private loop-distance + duration logic: distance via
`_loop_distance_km` (OSRM when `routing_provider=osrm`, else haversine), duration from
`walking_speed_kmh` + `minutes_per_stop * len(points)`. Empty/one-point inputs return `(0.0, 0)` /
the single-stop duration.

### 4.3 `draft_service.py`

- `create(req: DraftCreate) -> DraftTrail`: blank draft (no stops) at `req.start`; or, when
  `from_concept`, seed stops from `route_service.generate_trail(TrailRequest(...))` (its `Stop`s map
  to `DraftStop`s, carrying story+question). Assigns a uuid, default `title` ("Nieuwe tocht" or the
  concept's theme title), `status="concept"`. Persists via the store.
- `get(id)`, `list_drafts()` — from the store.
- `update(id, req: DraftUpdate) -> DraftTrail`: applies title/theme/status; if `stop_poi_ids` given,
  rebuilds the stop list (reuse existing `DraftStop`s by poi id; for new ids, fetch the POI from
  `poi_service.candidates(draft.start, draft.requested_distance_km)`); renumbers `order`; recomputes
  `actual_distance_km` + `estimated_duration_min` via `measure_loop`; re-derives `attributions`
  (`content_service.collect_attributions`). Unknown draft → `None` (404 at the API). A `stop_poi_id`
  not found among candidates is skipped (defensive).
- All persistence through a new `DraftStore`.

### 4.4 `DraftStore` (`backend/app/cache/store.py`)

Mirror the existing `TrailStore` ABC: `put/get/list/clear`, with `InMemory` (default, tests) and
`File` backends selected by `settings.draft_store` (`memory` | `file`, path `draft_store_path`).
Export from `cache/__init__.py`. Add `draft_store`/`draft_store_path` to `config.py`.

### 4.5 Routers

- `api/pois.py` — `GET /pois?lat&lon&distance_km` → `list[POI]` via `poi_service.candidates`.
  `distance_km` defaults to 5; bounds reuse the `TrailRequest` limits (1–25).
- `api/routes.py` — `POST /routes/measure` → `RouteMeasureResult` via `measure_loop`.
- `api/drafts.py` — `POST /drafts` (201), `GET /drafts`, `GET /drafts/{id}` (404 if unknown),
  `PUT /drafts/{id}` (404 if unknown).
- Register all three routers in `app/main.py`.

Degrade rather than break (PRD §13): POI fetch falls back to seed; measurement to haversine.

## 5. Frontend

### 5.1 API layer (`frontend/src/api/`)

- `types.ts` adds `DraftStop`, `DraftTrail`, `DraftStatus`, `DraftCreate`, `DraftUpdate`,
  `RouteMeasureResult` (mirroring §4.1).
- `pois.ts` — `getPois({lat, lon, distance_km}) -> POI[]`.
- `routes.ts` — `measureRoute({start, points}) -> RouteMeasureResult`.
- `drafts.ts` — `createDraft`, `getDraft`, `listDrafts`, `updateDraft`.

### 5.2 `studio/draftStore.tsx`

React context (pattern from `quester/store.tsx`) holding `{ draft?: DraftTrail; activeStopOrder?: number }`.
Actions: `createDraft(req)`, `loadDraft(id)`, `addStop(poi: POI)`, `removeStop(order)`,
`reorder(order, dir)`, `setActiveStop(order)`. `addStop` takes the full `POI` (the picker already
has it) so the new stop renders immediately; autosave then sends only the ordered ids and the
server returns the authoritative copy. Mutations update the client draft immediately
(optimistic) and schedule:
- **debounced autosave** (~500 ms) → `updateDraft(id, { stop_poi_ids, title, theme })`, replacing the
  draft with the server's recomputed copy (authoritative distance/duration/attributions);
- the autosave *is* the re-measure (the server recomputes distance on update), so there is one
  round-trip per change, not two.
The active draft id persists to `localStorage` (`tq.studio.draft`) so a reload resumes.

### 5.3 RouteEditor (rewrite the data layer; keep the visual layout)

Replace `MOCK_ROUTE_STOPS` + hardcoded strings with the draft store: stop list, header
title/theme/stat tiles, distance meter value + tolerance chip (computed from
`actual_distance_km` vs `requested_distance_km`, ±15%), stop count, and the validation chip
(grounded-stop count from `poi.facts.length`). Reorder/remove/add call the store. "Genereer
concept" creates a `from_concept` draft. Clicking a row → `setActiveStop(order)` +
`navigate("/studio/stop")`. The map plots `draft.stops`.

### 5.4 `studio/components/PoiPicker.tsx`

Modal opened by "+ Stop toevoegen". Lists `getPois` candidates near the draft start (name, fact
count, a "geen feiten" flag for `facts.length === 0`), excluding POIs already in the draft.
Selecting one → `addStop(poi)` and closes. Dialog is keyboard-dismissable; no `window.confirm`.

### 5.5 Dashboard

Fetch `listDrafts()` on mount; render real draft cards (title, theme, km, stop count, status)
**alongside** the existing `MOCK_TRAILS` (the published/example cards stay so the page looks full).
"Nieuwe tocht maken" / "Nieuwe tocht" → `createDraft({ start: Haarlem, distance_km: 5, theme })` →
navigate to `/studio/route`.

### 5.6 StopEditor — minimal change only

Read the active stop from the draft store (the POI clicked in the RouteEditor) for the header
(name, address/coords) and the locked Feiten zone (its real facts + source badges). If there is no
active draft/stop (e.g. deep-link), fall back to the existing `MOCK_STOP` so the screen still
renders. **No** content-authoring/save changes in this iteration.

## 6. Data flow

```
Dashboard "Nieuwe tocht" ─create─▶ POST /drafts ─▶ draftStore.draft ─▶ /studio/route
RouteEditor add/remove/reorder ─▶ draftStore (optimistic) ─debounce─▶ PUT /drafts/{id}
                                                         ◀── server recomputes distance/dur/attrib
"+ Stop toevoegen" ─▶ PoiPicker ─GET /pois─▶ pick ─▶ draftStore.addStop(poiId) ─▶ (autosave)
RouteEditor click row ─▶ draftStore.setActiveStop ─▶ /studio/stop ─▶ StopEditor reads active stop
Dashboard mount ─GET /drafts─▶ real cards + mock cards
```

## 7. Testing

**Backend (pytest, offline seed):**
- `route_service.measure_loop` — loop distance + duration for an ordered set; empty/one-point edges.
- `draft_service` — create blank + from_concept; update add/remove/reorder renumbers order and
  recomputes distance + attributions; unknown draft → None; unknown poi id skipped.
- API — `GET /pois` returns seed candidates near Haarlem; `POST /routes/measure` shape; drafts
  CRUD round-trip (create → get → update → list) + 404s.
- `DraftStore` memory + file round-trip (file survives a fresh instance).

**Frontend (Vitest + RTL, mocked fetch):**
- `draftStore` — add/remove/reorder mutate the active draft; debounced autosave fires once and
  replaces the draft with the server copy; `setActiveStop`.
- `api/` clients — request shape + `ApiError` on non-2xx.
- RouteEditor — renders real draft stops + measured distance; "+ Stop toevoegen" opens the picker;
  picking a candidate calls `addStop`; reorder updates order.
- `PoiPicker` — lists candidates, excludes already-added, calls `addStop` on select.
- Dashboard — lists drafts from `GET /drafts`; "Nieuwe tocht" creates + navigates.
- StopEditor — with an active draft stop, shows that POI's name/facts; with none, falls back to mock.

The existing player suite and current studio tests stay green (mock cards remain on the Dashboard).

## 8. Out of scope

Full Stop-editor authoring/save, Validation real grounding, publish/moderation, draft delete,
auth/ownership, real map tiles, time-based input. Each leaves a clean seam (the draft model,
`draftStore`, and the new endpoints) to extend later.

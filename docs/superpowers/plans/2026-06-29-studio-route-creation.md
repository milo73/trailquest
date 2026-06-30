# Studio Route Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/studio/route` a working route editor — a real, persisted, shared trail draft built from real POIs with live distance — via new backend endpoints and a frontend draft store.

**Architecture:** Backend gains a `DraftTrail`/`DraftStop` model (content optional), a `draft_service`, a `DraftStore` (memory/file), a public `route_service.measure_loop`, and three routers (`/pois`, `/routes/measure`, `/drafts`). Frontend gains a shared `DraftProvider` store (optimistic mutation + save-on-change), API clients, a `PoiPicker`, and rewired `RouteEditor`/`Dashboard` plus a minimal `StopEditor` change so a clicked stop opens that POI.

**Tech Stack:** Python 3 / FastAPI / Pydantic / pytest (backend); Vite + React + TypeScript + Vitest + React Testing Library (frontend).

## Source-of-truth convention

Backend tasks give full Python. Frontend logic tasks (types, clients, store) give full TypeScript. The three screen rewires (RouteEditor, Dashboard, StopEditor) modify existing files — the plan cites the file and specifies the exact data-layer swaps to make, and gives **full test code**. Read the current file before editing it.

Run backends from `backend/` (`pytest`); frontend from `frontend/` (`npm test`).

## Global Constraints

- **Offline by default.** Everything must work with no network/keys: seed POIs (`poi_service.candidates` falls back to the bundled Haarlem set) and haversine distance. Tests run offline.
- **Player invariant preserved.** Do NOT make `Stop.story`/`Stop.question` optional. Drafts use a separate `DraftStop` with optional content. The player only ever sees `Trail`/`Stop`.
- **Degrade rather than break (PRD §13).** POI fetch falls back to seed; an unknown draft id returns `None`/404; an unknown POI id on update is skipped.
- **Save model (simplification of the spec's "debounced autosave"):** structural mutations (add/remove/reorder/create) are discrete user clicks, so the frontend store saves **immediately** after each mutation (one `PUT` per change) rather than debouncing. The server recomputes distance/duration/attributions on every `PUT`, so the save *is* the re-measure.
- **UI strings in Dutch.** **No `window.confirm`/`alert`/`prompt`.**
- **Backend CI green:** keep `ruff`, `ruff format`, `mypy app`, and `pytest` passing on backend changes.
- **Frontend:** existing player + studio suites stay green; `npm run typecheck` stays clean.
- Backend run dir: `backend/`. Frontend run dir: `frontend/`.

---

### Task 1: Draft schemas + config

**Files:**
- Modify: `backend/app/models/schemas.py` (append new models)
- Modify: `backend/app/config.py` (add draft-store settings)
- Test: `backend/tests/test_draft_schemas.py`

**Interfaces:**
- Produces: `DraftStatus` (StrEnum), `DraftStop`, `DraftTrail`, `DraftCreate`, `DraftUpdate`, `RouteMeasureRequest`, `RouteMeasureResult`; `settings.draft_store` / `settings.draft_store_path`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_draft_schemas.py`:
```python
from app.models.schemas import (
    POI,
    DraftCreate,
    DraftStop,
    DraftTrail,
    GeoPoint,
)


def _poi() -> POI:
    return POI(id="p1", name="Grote Markt", location=GeoPoint(lat=52.38, lon=4.63))


def test_draft_stop_content_is_optional():
    stop = DraftStop(order=1, poi=_poi())
    assert stop.story is None
    assert stop.question is None


def test_draft_trail_defaults_to_concept():
    draft = DraftTrail(
        id="d1",
        title="Nieuwe tocht",
        city="Haarlem",
        theme="historical",
        start=GeoPoint(lat=52.38, lon=4.63),
        requested_distance_km=5,
        actual_distance_km=0,
        estimated_duration_min=0,
        stops=[DraftStop(order=1, poi=_poi())],
    )
    assert draft.status == "concept"
    assert draft.attributions == []


def test_draft_create_defaults():
    req = DraftCreate(start=GeoPoint(lat=52.38, lon=4.63))
    assert req.distance_km == 5
    assert req.theme == "mixed"
    assert req.from_concept is False
    assert req.title is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_draft_schemas.py -q`
Expected: FAIL (ImportError: cannot import name 'DraftStop').

- [ ] **Step 3: Append the models to `schemas.py`**

Add at the end of `backend/app/models/schemas.py`:
```python
class DraftStatus(StrEnum):
    """Lifecycle of a creator's draft trail (pre-publication)."""

    CONCEPT = "concept"
    REVIEW = "review"
    PUBLISHED = "published"


class DraftStop(BaseModel):
    """A stop on a draft trail. Unlike a player-facing ``Stop``, the generated
    ``story``/``question`` are optional — they are authored later in the studio."""

    order: int
    poi: POI
    story: str | None = None
    question: Question | None = None


class DraftTrail(BaseModel):
    """A creator's work-in-progress trail. The player never sees this; only a
    published ``Trail`` (with fully-grounded ``Stop``s) is playable."""

    id: str
    title: str
    city: str
    theme: Theme
    start: GeoPoint
    requested_distance_km: float
    actual_distance_km: float
    estimated_duration_min: int
    stops: list[DraftStop] = Field(default_factory=list)
    status: DraftStatus = DraftStatus.CONCEPT
    attributions: list[str] = Field(default_factory=list)


class DraftCreate(BaseModel):
    title: str | None = None
    start: GeoPoint
    distance_km: float = Field(default=5, ge=1, le=25)
    theme: Theme = Theme.MIXED
    from_concept: bool = False


class DraftUpdate(BaseModel):
    title: str | None = None
    theme: Theme | None = None
    status: DraftStatus | None = None
    # Full ordered list of POI ids the draft should now contain (add/remove/reorder
    # in one idempotent update). None means "leave stops unchanged".
    stop_poi_ids: list[str] | None = None


class RouteMeasureRequest(BaseModel):
    start: GeoPoint
    points: list[GeoPoint] = Field(default_factory=list)


class RouteMeasureResult(BaseModel):
    distance_km: float
    duration_min: int
```

- [ ] **Step 4: Add config settings**

In `backend/app/config.py`, after the `content_db_path` line (around line 38), add:
```python
    # Studio draft trails. "memory" (default, tests) is in-process; "file"
    # persists each draft as JSON under draft_store_path so drafts survive restarts.
    draft_store: str = "memory"
    draft_store_path: str = "drafts"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_draft_schemas.py -q`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/schemas.py backend/app/config.py backend/tests/test_draft_schemas.py
git commit -m "feat(backend): draft trail schemas + draft-store config"
```

---

### Task 2: `route_service.measure_loop`

**Files:**
- Modify: `backend/app/services/route_service.py` (add public function)
- Test: `backend/tests/test_measure_loop.py`

**Interfaces:**
- Consumes: existing `_haversine_km`, `settings.walking_speed_kmh`, `settings.minutes_per_stop`.
- Produces: `measure_loop(start: GeoPoint, ordered_points: list[GeoPoint]) -> tuple[float, int]` returning `(distance_km, duration_min)`, measuring the loop start → points → start **in the given order** (haversine; the creator controls order).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_measure_loop.py`:
```python
from app.models.schemas import GeoPoint
from app.services.route_service import measure_loop


def test_empty_points_is_zero():
    assert measure_loop(GeoPoint(lat=52.38, lon=4.63), []) == (0.0, 0)


def test_loop_distance_and_duration_increase_with_points():
    start = GeoPoint(lat=52.380, lon=4.630)
    one = measure_loop(start, [GeoPoint(lat=52.385, lon=4.640)])
    two = measure_loop(
        start, [GeoPoint(lat=52.385, lon=4.640), GeoPoint(lat=52.390, lon=4.650)]
    )
    assert one[0] > 0
    assert two[0] > one[0]  # more stops, longer loop
    assert two[1] > one[1]  # and longer duration


def test_single_point_loop_is_out_and_back():
    start = GeoPoint(lat=52.380, lon=4.630)
    p = GeoPoint(lat=52.385, lon=4.630)
    dist, dur = measure_loop(start, [p])
    assert dist > 0
    assert isinstance(dur, int)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_measure_loop.py -q`
Expected: FAIL (ImportError: cannot import name 'measure_loop').

- [ ] **Step 3: Add the function**

In `backend/app/services/route_service.py`, after `_loop_distance_km` (around line 55), add:
```python
def measure_loop(start: GeoPoint, ordered_points: list[GeoPoint]) -> tuple[float, int]:
    """Measure a loop (start → points → start) in the given order.

    The creator controls stop order, so this does NOT reorder. Distance is the
    haversine loop estimate; duration adds walking time plus per-stop time.
    Returns ``(distance_km, duration_min)``.
    """
    if not ordered_points:
        return 0.0, 0
    points = [start, *ordered_points, start]
    distance = round(
        sum(_haversine_km(points[i], points[i + 1]) for i in range(len(points) - 1)), 2
    )
    walk_min = (distance / settings.walking_speed_kmh) * 60
    duration = round(walk_min + len(ordered_points) * settings.minutes_per_stop)
    return distance, duration
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_measure_loop.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/route_service.py backend/tests/test_measure_loop.py
git commit -m "feat(backend): expose route_service.measure_loop"
```

---

### Task 3: DraftStore (memory + file)

**Files:**
- Modify: `backend/app/cache/store.py` (append store classes + singleton)
- Modify: `backend/app/cache/__init__.py` (export)
- Test: `backend/tests/test_draft_store.py`

**Interfaces:**
- Consumes: `DraftTrail` (Task 1), `settings.draft_store`/`draft_store_path` (Task 1).
- Produces: `DraftStore` (ABC: `put/get/list_drafts/clear`), `InMemoryDraftStore`, `FileDraftStore`, and a module singleton `drafts` selected by config.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_draft_store.py`:
```python
from app.cache.store import FileDraftStore, InMemoryDraftStore
from app.models.schemas import DraftStop, DraftTrail, GeoPoint, POI


def _draft(draft_id: str = "d1") -> DraftTrail:
    return DraftTrail(
        id=draft_id,
        title="Nieuwe tocht",
        city="Haarlem",
        theme="historical",
        start=GeoPoint(lat=52.38, lon=4.63),
        requested_distance_km=5,
        actual_distance_km=1.2,
        estimated_duration_min=20,
        stops=[DraftStop(order=1, poi=POI(id="p1", name="Grote Markt", location=GeoPoint(lat=52.38, lon=4.63)))],
    )


def test_memory_roundtrip_and_list():
    store = InMemoryDraftStore()
    store.put(_draft("a"))
    store.put(_draft("b"))
    assert store.get("a").title == "Nieuwe tocht"
    assert {d.id for d in store.list_drafts()} == {"a", "b"}
    assert store.get("missing") is None


def test_file_store_persists_across_instances(tmp_path):
    FileDraftStore(str(tmp_path)).put(_draft("a"))
    # a fresh instance pointed at the same dir sees it
    reopened = FileDraftStore(str(tmp_path))
    assert reopened.get("a").id == "a"
    assert [d.id for d in reopened.list_drafts()] == ["a"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_draft_store.py -q`
Expected: FAIL (ImportError).

- [ ] **Step 3: Append the store classes**

At the end of `backend/app/cache/store.py` add (the file already imports `ABC`, `abstractmethod`, `Path`, `settings`; it imports schema types at the top — add `DraftTrail` to that import):
```python
class DraftStore(ABC):
    """Registry of creator draft trails."""

    @abstractmethod
    def put(self, draft: DraftTrail) -> None: ...

    @abstractmethod
    def get(self, draft_id: str) -> DraftTrail | None: ...

    @abstractmethod
    def list_drafts(self) -> list[DraftTrail]: ...

    @abstractmethod
    def clear(self) -> None: ...


class InMemoryDraftStore(DraftStore):
    def __init__(self) -> None:
        self._drafts: dict[str, DraftTrail] = {}

    def put(self, draft: DraftTrail) -> None:
        self._drafts[draft.id] = draft

    def get(self, draft_id: str) -> DraftTrail | None:
        return self._drafts.get(draft_id)

    def list_drafts(self) -> list[DraftTrail]:
        return list(self._drafts.values())

    def clear(self) -> None:
        self._drafts.clear()


class FileDraftStore(DraftStore):
    """Persist each draft as ``<id>.json`` under a directory (survives restarts)."""

    def __init__(self, dir_path: str) -> None:
        self._dir = Path(dir_path)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, draft_id: str) -> Path:
        return self._dir / f"{Path(draft_id).name}.json"  # .name guards path traversal

    def put(self, draft: DraftTrail) -> None:
        self._path(draft.id).write_text(draft.model_dump_json(indent=2), encoding="utf-8")

    def get(self, draft_id: str) -> DraftTrail | None:
        path = self._path(draft_id)
        if not path.exists():
            return None
        return DraftTrail.model_validate_json(path.read_text(encoding="utf-8"))

    def list_drafts(self) -> list[DraftTrail]:
        out: list[DraftTrail] = []
        for f in sorted(self._dir.glob("*.json")):
            out.append(DraftTrail.model_validate_json(f.read_text(encoding="utf-8")))
        return out

    def clear(self) -> None:
        for f in self._dir.glob("*.json"):
            f.unlink()


def _build_draft_store() -> DraftStore:
    if settings.draft_store == "file":
        return FileDraftStore(settings.draft_store_path)
    return InMemoryDraftStore()


drafts: DraftStore = _build_draft_store()
```

Confirm the top-of-file schema import includes `DraftTrail`. The current import is:
```python
from app.models.schemas import Stop, Theme, Trail
```
Change it to:
```python
from app.models.schemas import DraftTrail, Stop, Theme, Trail
```

- [ ] **Step 4: Export from `cache/__init__.py`**

Add `DraftStore`, `FileDraftStore`, `InMemoryDraftStore`, `drafts` to both the import block and `__all__` in `backend/app/cache/__init__.py`.

- [ ] **Step 5: Run tests + lint**

Run: `cd backend && pytest tests/test_draft_store.py -q && ruff check app && mypy app`
Expected: tests PASS (2 passed); ruff + mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/cache/store.py backend/app/cache/__init__.py backend/tests/test_draft_store.py
git commit -m "feat(backend): DraftStore (memory + file backends)"
```

---

### Task 4: `draft_service`

**Files:**
- Create: `backend/app/services/draft_service.py`
- Test: `backend/tests/test_draft_service.py`

**Interfaces:**
- Consumes: `DraftTrail`/`DraftStop`/`DraftCreate`/`DraftUpdate` (Task 1); `route_service.generate_trail`, `route_service.measure_loop` (Task 2); `poi_service.candidates`; `content_service.collect_attributions`; `cache.store.drafts` (Task 3).
- Produces: `create(req: DraftCreate) -> DraftTrail`, `get(draft_id: str) -> DraftTrail | None`, `list_drafts() -> list[DraftTrail]`, `update(draft_id: str, req: DraftUpdate) -> DraftTrail | None`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_draft_service.py`:
```python
import pytest

from app.cache.store import drafts
from app.models.schemas import DraftCreate, DraftUpdate, GeoPoint
from app.services import draft_service, poi_service

HAARLEM = GeoPoint(lat=52.3812, lon=4.6361)


@pytest.fixture(autouse=True)
def _clear_drafts():
    drafts.clear()
    yield
    drafts.clear()


def test_create_blank_draft_is_empty_and_persisted():
    d = draft_service.create(DraftCreate(start=HAARLEM, title="Mijn tocht"))
    assert d.title == "Mijn tocht"
    assert d.stops == []
    assert d.actual_distance_km == 0.0
    assert draft_service.get(d.id).id == d.id
    assert d.id in {x.id for x in draft_service.list_drafts()}


def test_create_from_concept_has_stops():
    d = draft_service.create(DraftCreate(start=HAARLEM, theme="historical", from_concept=True))
    assert len(d.stops) >= 1
    assert d.actual_distance_km > 0


def test_update_adds_stops_recomputes_distance_and_attributions():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    candidate_ids = [p.id for p in poi_service.candidates(HAARLEM, 5)][:2]
    updated = draft_service.update(d.id, DraftUpdate(stop_poi_ids=candidate_ids))
    assert [s.poi.id for s in updated.stops] == candidate_ids
    assert [s.order for s in updated.stops] == [1, 2]
    assert updated.actual_distance_km > 0
    assert updated.attributions  # non-empty once grounded stops are present


def test_update_reorder_and_remove():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    ids = [p.id for p in poi_service.candidates(HAARLEM, 5)][:2]
    draft_service.update(d.id, DraftUpdate(stop_poi_ids=ids))
    reordered = draft_service.update(d.id, DraftUpdate(stop_poi_ids=list(reversed(ids))))
    assert [s.poi.id for s in reordered.stops] == list(reversed(ids))
    removed = draft_service.update(d.id, DraftUpdate(stop_poi_ids=[ids[0]]))
    assert [s.poi.id for s in removed.stops] == [ids[0]]


def test_update_unknown_draft_returns_none():
    assert draft_service.update("nope", DraftUpdate(title="x")) is None


def test_update_skips_unknown_poi_id():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    updated = draft_service.update(d.id, DraftUpdate(stop_poi_ids=["does-not-exist"]))
    assert updated.stops == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_draft_service.py -q`
Expected: FAIL (ModuleNotFoundError: app.services.draft_service).

- [ ] **Step 3: Implement the service**

`backend/app/services/draft_service.py`:
```python
"""Draft trail service for the studio (PRD §9.1 creator tooling).

A draft is a creator's work-in-progress: a start point plus an ordered list of
POI stops. Generated content (story/question) is optional and authored later;
the player only ever sees a published ``Trail`` with fully-grounded ``Stop``s.
"""

from __future__ import annotations

import uuid

from app.cache.store import drafts
from app.models.schemas import (
    DraftCreate,
    DraftStop,
    DraftTrail,
    DraftUpdate,
    Source,
    TrailRequest,
)
from app.config import settings
from app.services import content_service, poi_service, route_service


def _attributions(stops: list[DraftStop]) -> list[str]:
    sources: list[Source] = [f.source for s in stops for f in s.poi.facts]
    sources += [s.poi.background_source for s in stops if s.poi.background_source is not None]
    attributions = content_service.collect_attributions(sources)
    osm_attr = "OpenStreetMap (ODbL)"
    if osm_attr not in attributions:
        attributions.append(osm_attr)
    return sorted(attributions)


def _measure(draft: DraftTrail) -> DraftTrail:
    distance, duration = route_service.measure_loop(
        draft.start, [s.poi.location for s in draft.stops]
    )
    draft.actual_distance_km = distance
    draft.estimated_duration_min = duration
    draft.attributions = _attributions(draft.stops)
    return draft


def create(req: DraftCreate) -> DraftTrail:
    draft = DraftTrail(
        id=str(uuid.uuid4()),
        title=req.title or "Nieuwe tocht",
        city=settings.default_city,
        theme=req.theme,
        start=req.start,
        requested_distance_km=req.distance_km,
        actual_distance_km=0.0,
        estimated_duration_min=0,
        stops=[],
    )
    if req.from_concept:
        trail = route_service.generate_trail(
            TrailRequest(start=req.start, distance_km=req.distance_km, theme=req.theme)
        )
        draft.stops = [
            DraftStop(order=s.order, poi=s.poi, story=s.story, question=s.question)
            for s in trail.stops
        ]
    _measure(draft)
    drafts.put(draft)
    return draft


def get(draft_id: str) -> DraftTrail | None:
    return drafts.get(draft_id)


def list_drafts() -> list[DraftTrail]:
    return drafts.list_drafts()


def update(draft_id: str, req: DraftUpdate) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    if req.title is not None:
        draft.title = req.title
    if req.theme is not None:
        draft.theme = req.theme
    if req.status is not None:
        draft.status = req.status
    if req.stop_poi_ids is not None:
        existing = {s.poi.id: s for s in draft.stops}
        catalog = {p.id: p for p in poi_service.candidates(draft.start, draft.requested_distance_km)}
        new_stops: list[DraftStop] = []
        for i, poi_id in enumerate(req.stop_poi_ids):
            if poi_id in existing:
                stop = existing[poi_id]
                stop.order = i + 1
                new_stops.append(stop)
            elif poi_id in catalog:
                new_stops.append(DraftStop(order=i + 1, poi=catalog[poi_id]))
            # unknown id → skip (degrade rather than break)
        draft.stops = new_stops
    _measure(draft)
    drafts.put(draft)
    return draft
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && pytest tests/test_draft_service.py -q && ruff check app && mypy app`
Expected: tests PASS (6 passed); ruff + mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/draft_service.py backend/tests/test_draft_service.py
git commit -m "feat(backend): draft_service (create/get/list/update)"
```

---

### Task 5: `/pois` + `/routes/measure` routers

**Files:**
- Create: `backend/app/api/pois.py`, `backend/app/api/routes.py`
- Modify: `backend/app/main.py` (register both)
- Test: `backend/tests/test_pois_routes_api.py`

**Interfaces:**
- Consumes: `poi_service.candidates`; `route_service.measure_loop`; `RouteMeasureRequest`/`RouteMeasureResult` (Task 1).
- Produces: `GET /pois?lat&lon&distance_km` → `list[POI]`; `POST /routes/measure` → `RouteMeasureResult`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_pois_routes_api.py`:
```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_pois_returns_seed_candidates_near_haarlem():
    r = client.get("/pois", params={"lat": 52.3812, "lon": 4.6361, "distance_km": 5})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    assert {"id", "name", "location"} <= set(body[0].keys())


def test_measure_route_returns_distance_and_duration():
    r = client.post(
        "/routes/measure",
        json={
            "start": {"lat": 52.380, "lon": 4.630},
            "points": [{"lat": 52.385, "lon": 4.640}, {"lat": 52.390, "lon": 4.650}],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["distance_km"] > 0
    assert body["duration_min"] > 0


def test_measure_route_empty_points_is_zero():
    r = client.post("/routes/measure", json={"start": {"lat": 52.38, "lon": 4.63}, "points": []})
    assert r.json() == {"distance_km": 0.0, "duration_min": 0}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_pois_routes_api.py -q`
Expected: FAIL (404s — routes not registered).

- [ ] **Step 3: Implement the routers**

`backend/app/api/pois.py`:
```python
"""POI catalog endpoint — candidate POIs near a point (studio route editor)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.schemas import POI, GeoPoint
from app.services import poi_service

router = APIRouter(prefix="/pois", tags=["pois"])


@router.get("", response_model=list[POI])
def list_pois(
    lat: float = Query(...),
    lon: float = Query(...),
    distance_km: float = Query(5, ge=1, le=25),
) -> list[POI]:
    """Candidate POIs near a start point (seed set offline, OSM/Wikidata live)."""
    return poi_service.candidates(GeoPoint(lat=lat, lon=lon), distance_km)
```

`backend/app/api/routes.py`:
```python
"""Route measurement endpoint — live loop distance/duration for the studio editor."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import RouteMeasureRequest, RouteMeasureResult
from app.services import route_service

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/measure", response_model=RouteMeasureResult)
def measure(req: RouteMeasureRequest) -> RouteMeasureResult:
    distance_km, duration_min = route_service.measure_loop(req.start, req.points)
    return RouteMeasureResult(distance_km=distance_km, duration_min=duration_min)
```

- [ ] **Step 4: Register in `main.py`**

In `backend/app/main.py`, add `pois, routes` to the `from app.api import ...` line and add:
```python
app.include_router(pois.router)
app.include_router(routes.router)
```

- [ ] **Step 5: Run tests + lint**

Run: `cd backend && pytest tests/test_pois_routes_api.py -q && ruff check app && mypy app`
Expected: tests PASS (3 passed); clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/pois.py backend/app/api/routes.py backend/app/main.py backend/tests/test_pois_routes_api.py
git commit -m "feat(backend): /pois and /routes/measure endpoints"
```

---

### Task 6: `/drafts` router

**Files:**
- Create: `backend/app/api/drafts.py`
- Modify: `backend/app/main.py` (register)
- Test: `backend/tests/test_drafts_api.py`

**Interfaces:**
- Consumes: `draft_service` (Task 4); `DraftTrail`/`DraftCreate`/`DraftUpdate` (Task 1).
- Produces: `POST /drafts` (201), `GET /drafts`, `GET /drafts/{id}`, `PUT /drafts/{id}`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_drafts_api.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def test_create_get_list_roundtrip():
    created = client.post("/drafts", json={"start": HAARLEM, "title": "Mijn tocht"})
    assert created.status_code == 201
    draft_id = created.json()["id"]
    assert created.json()["title"] == "Mijn tocht"

    got = client.get(f"/drafts/{draft_id}")
    assert got.status_code == 200
    assert got.json()["id"] == draft_id

    listed = client.get("/drafts")
    assert listed.status_code == 200
    assert draft_id in {d["id"] for d in listed.json()}


def test_update_changes_title():
    draft_id = client.post("/drafts", json={"start": HAARLEM}).json()["id"]
    r = client.put(f"/drafts/{draft_id}", json={"title": "Hernoemd"})
    assert r.status_code == 200
    assert r.json()["title"] == "Hernoemd"


def test_get_unknown_is_404():
    assert client.get("/drafts/nope").status_code == 404


def test_update_unknown_is_404():
    assert client.put("/drafts/nope", json={"title": "x"}).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_drafts_api.py -q`
Expected: FAIL (404 on POST /drafts — not registered).

- [ ] **Step 3: Implement the router**

`backend/app/api/drafts.py`:
```python
"""Draft trail CRUD for the studio route editor."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import DraftCreate, DraftTrail, DraftUpdate
from app.services import draft_service

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.post("", response_model=DraftTrail, status_code=201)
def create_draft(req: DraftCreate) -> DraftTrail:
    return draft_service.create(req)


@router.get("", response_model=list[DraftTrail])
def list_drafts() -> list[DraftTrail]:
    return draft_service.list_drafts()


@router.get("/{draft_id}", response_model=DraftTrail)
def get_draft(draft_id: str) -> DraftTrail:
    draft = draft_service.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.put("/{draft_id}", response_model=DraftTrail)
def update_draft(draft_id: str, req: DraftUpdate) -> DraftTrail:
    draft = draft_service.update(draft_id, req)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft
```

- [ ] **Step 4: Register in `main.py`**

Add `drafts` to `from app.api import ...` and `app.include_router(drafts.router)`. (Note: `drafts` here is the API module `app.api.drafts`; do not confuse it with the store singleton `app.cache.store.drafts` — they are different imports in different files.)

- [ ] **Step 5: Run full backend suite + lint + types**

Run: `cd backend && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/drafts.py backend/app/main.py backend/tests/test_drafts_api.py
git commit -m "feat(backend): /drafts CRUD endpoints"
```

---

### Task 7: Frontend API types + clients

**Files:**
- Modify: `frontend/src/api/types.ts` (add draft/measure types)
- Create: `frontend/src/api/pois.ts`, `frontend/src/api/routes.ts`, `frontend/src/api/drafts.ts`
- Test: `frontend/src/api/drafts.test.ts`

**Interfaces:**
- Consumes: existing `apiFetch`/`ApiError` (`api/client.ts`), `POI`/`GeoPoint`/`Theme`/`Question` (`api/types.ts`).
- Produces:
  - types: `DraftStatus`, `DraftStop`, `DraftTrail`, `DraftCreate`, `DraftUpdate`, `RouteMeasureResult`.
  - `getPois({ lat, lon, distance_km }): Promise<POI[]>`
  - `measureRoute({ start, points }): Promise<RouteMeasureResult>`
  - `createDraft(req: DraftCreate): Promise<DraftTrail>`, `getDraft(id): Promise<DraftTrail>`, `listDrafts(): Promise<DraftTrail[]>`, `updateDraft(id, req: DraftUpdate): Promise<DraftTrail>`

- [ ] **Step 1: Add the types**

Append to `frontend/src/api/types.ts`:
```ts
export type DraftStatus = "concept" | "review" | "published";

export interface DraftStop {
  order: number;
  poi: POI;
  story?: string | null;
  question?: Question | null;
}

export interface DraftTrail {
  id: string;
  title: string;
  city: string;
  theme: Theme;
  start: GeoPoint;
  requested_distance_km: number;
  actual_distance_km: number;
  estimated_duration_min: number;
  stops: DraftStop[];
  status: DraftStatus;
  attributions: string[];
}

export interface DraftCreate {
  title?: string;
  start: GeoPoint;
  distance_km?: number;
  theme?: Theme;
  from_concept?: boolean;
}

export interface DraftUpdate {
  title?: string;
  theme?: Theme;
  status?: DraftStatus;
  stop_poi_ids?: string[];
}

export interface RouteMeasureResult {
  distance_km: number;
  duration_min: number;
}
```

- [ ] **Step 2: Create the clients**

`frontend/src/api/pois.ts`:
```ts
import { apiFetch } from "./client";
import type { GeoPoint, POI } from "./types";

export const getPois = ({ lat, lon, distance_km = 5 }: { lat: number; lon: number; distance_km?: number }) =>
  apiFetch<POI[]>(`/pois?lat=${lat}&lon=${lon}&distance_km=${distance_km}`);

export type { GeoPoint };
```

`frontend/src/api/routes.ts`:
```ts
import { apiFetch } from "./client";
import type { GeoPoint, RouteMeasureResult } from "./types";

export const measureRoute = (body: { start: GeoPoint; points: GeoPoint[] }) =>
  apiFetch<RouteMeasureResult>("/routes/measure", { method: "POST", body: JSON.stringify(body) });
```

`frontend/src/api/drafts.ts`:
```ts
import { apiFetch } from "./client";
import type { DraftCreate, DraftTrail, DraftUpdate } from "./types";

export const createDraft = (req: DraftCreate) =>
  apiFetch<DraftTrail>("/drafts", { method: "POST", body: JSON.stringify(req) });

export const getDraft = (id: string) => apiFetch<DraftTrail>(`/drafts/${id}`);

export const listDrafts = () => apiFetch<DraftTrail[]>("/drafts");

export const updateDraft = (id: string, req: DraftUpdate) =>
  apiFetch<DraftTrail>(`/drafts/${id}`, { method: "PUT", body: JSON.stringify(req) });
```

- [ ] **Step 3: Write the failing test**

`frontend/src/api/drafts.test.ts`:
```ts
import { afterEach, expect, test, vi } from "vitest";
import { createDraft, updateDraft } from "./drafts";
import { getPois } from "./pois";

afterEach(() => vi.restoreAllMocks());

test("createDraft POSTs the request and returns the draft", async () => {
  const draft = { id: "d1", title: "Nieuwe tocht", stops: [] };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(draft), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await createDraft({ start: { lat: 52.38, lon: 4.63 } });

  expect(result).toEqual(draft);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts");
  expect(init.method).toBe("POST");
});

test("updateDraft PUTs stop_poi_ids", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await updateDraft("d1", { stop_poi_ids: ["a", "b"] });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toEqual({ stop_poi_ids: ["a", "b"] });
});

test("getPois builds the query string", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await getPois({ lat: 52.38, lon: 4.63, distance_km: 5 });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/pois?lat=52.38&lon=4.63&distance_km=5");
});
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- drafts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): draft/pois/routes API types + clients"
```

---

### Task 8: Draft store + provider

**Files:**
- Create: `frontend/src/studio/draftStore.tsx`
- Modify: `frontend/src/studio/StudioApp.tsx` (wrap routes in `<DraftProvider>`)
- Test: `frontend/src/studio/draftStore.test.tsx`

**Interfaces:**
- Consumes: `createDraft`/`getDraft`/`updateDraft` (`api/drafts`), `DraftTrail`/`DraftCreate`/`POI` (`api/types`).
- Produces:
  - `DraftProvider({ children })`
  - `useDraft()` → `{ draft?: DraftTrail; activeStopOrder?: number; createDraft(req: DraftCreate): Promise<DraftTrail>; loadDraft(id: string): Promise<void>; addStop(poi: POI): Promise<void>; removeStop(order: number): Promise<void>; reorder(order: number, dir: "up" | "down"): Promise<void>; setActiveStop(order: number): void }`
  - Behavior: structural mutations update `draft` optimistically (renumbering `order`), then `await updateDraft(id, { stop_poi_ids })` and replace `draft` with the server copy. `createDraft` sets `draft` and persists its id to `localStorage["tq.studio.draft"]`. `loadDraft` fetches by id.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/draftStore.test.tsx`:
```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DraftProvider, useDraft } from "./draftStore";
import type { DraftTrail, POI } from "../api/types";

const wrapper = ({ children }: { children: React.ReactNode }) => <DraftProvider>{children}</DraftProvider>;

const poi = (id: string, name: string): POI => ({ id, name, location: { lat: 52.38, lon: 4.63 }, facts: [] });

const draft = (stops: { order: number; poi: POI }[]): DraftTrail => ({
  id: "d1", title: "Nieuwe tocht", city: "Haarlem", theme: "historical",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1.2,
  estimated_duration_min: 20, stops, status: "concept", attributions: [],
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function mockJson(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test("createDraft sets the draft and persists its id", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJson(draft([]), 201)));
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => {
    await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } });
  });
  expect(result.current.draft?.id).toBe("d1");
  expect(localStorage.getItem("tq.studio.draft")).toBe("d1");
});

test("addStop optimistically appends then replaces with the server copy", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson(draft([{ order: 1, poi: poi("p1", "Stadhuis") }]))); // updateDraft
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => {
    await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } });
  });
  await act(async () => {
    await result.current.addStop(poi("p1", "Stadhuis"));
  });

  await waitFor(() => expect(result.current.draft?.stops).toHaveLength(1));
  expect(result.current.draft?.stops[0].poi.name).toBe("Stadhuis");
  // the second fetch is the PUT carrying the new stop id
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1");
  expect(JSON.parse(putCall[1].body).stop_poi_ids).toEqual(["p1"]);
});

test("setActiveStop records the selected order", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJson(draft([{ order: 1, poi: poi("p1", "X") }]), 201)));
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => {
    await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } });
  });
  act(() => result.current.setActiveStop(1));
  expect(result.current.activeStopOrder).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- draftStore`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `draftStore.tsx`**

```tsx
import { createContext, useContext, useMemo, useState } from "react";
import { createDraft as apiCreate, getDraft, updateDraft } from "../api/drafts";
import type { DraftCreate, DraftStop, DraftTrail, POI } from "../api/types";

const STORAGE_KEY = "tq.studio.draft";

interface DraftApi {
  draft?: DraftTrail;
  activeStopOrder?: number;
  createDraft: (req: DraftCreate) => Promise<DraftTrail>;
  loadDraft: (id: string) => Promise<void>;
  addStop: (poi: POI) => Promise<void>;
  removeStop: (order: number) => Promise<void>;
  reorder: (order: number, dir: "up" | "down") => Promise<void>;
  setActiveStop: (order: number) => void;
}

const Ctx = createContext<DraftApi | null>(null);

function renumber(stops: DraftStop[]): DraftStop[] {
  return stops.map((s, i) => ({ ...s, order: i + 1 }));
}

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<DraftTrail | undefined>(undefined);
  const [activeStopOrder, setActiveStopOrder] = useState<number | undefined>(undefined);

  const api = useMemo<DraftApi>(() => {
    // Persist the new stop order to the server; replace local draft with the
    // authoritative copy (recomputed distance/duration/attributions).
    async function save(next: DraftTrail) {
      setDraft(next); // optimistic
      const saved = await updateDraft(next.id, { stop_poi_ids: next.stops.map((s) => s.poi.id) });
      setDraft(saved);
    }
    return {
      draft,
      activeStopOrder,
      createDraft: async (req) => {
        const created = await apiCreate(req);
        setDraft(created);
        localStorage.setItem(STORAGE_KEY, created.id);
        return created;
      },
      loadDraft: async (id) => {
        const loaded = await getDraft(id);
        setDraft(loaded);
        localStorage.setItem(STORAGE_KEY, loaded.id);
      },
      addStop: async (poi) => {
        if (!draft) return;
        const next = { ...draft, stops: renumber([...draft.stops, { order: 0, poi }]) };
        await save(next);
      },
      removeStop: async (order) => {
        if (!draft) return;
        const next = { ...draft, stops: renumber(draft.stops.filter((s) => s.order !== order)) };
        await save(next);
      },
      reorder: async (order, dir) => {
        if (!draft) return;
        const i = draft.stops.findIndex((s) => s.order === order);
        const j = dir === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= draft.stops.length) return;
        const swapped = [...draft.stops];
        [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
        await save({ ...draft, stops: renumber(swapped) });
      },
      setActiveStop: (order) => setActiveStopOrder(order),
    };
  }, [draft, activeStopOrder]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDraft(): DraftApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDraft must be used within DraftProvider");
  return ctx;
}
```

- [ ] **Step 4: Wrap StudioApp routes**

In `frontend/src/studio/StudioApp.tsx`, import `DraftProvider` and wrap the returned `<Routes>...</Routes>` in `<DraftProvider>...</DraftProvider>` so all studio screens share one draft.

- [ ] **Step 5: Run tests**

Run: `cd frontend && npm test -- draftStore`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/studio/draftStore.tsx frontend/src/studio/StudioApp.tsx frontend/src/studio/draftStore.test.tsx
git commit -m "feat(frontend): shared studio draft store + provider"
```

---

### Task 9: PoiPicker

**Files:**
- Create: `frontend/src/studio/components/PoiPicker.tsx`
- Test: `frontend/src/studio/components/PoiPicker.test.tsx`

**Interfaces:**
- Consumes: `getPois` (`api/pois`), `POI`/`GeoPoint` (`api/types`).
- Produces: `PoiPicker({ start, excludeIds, onPick, onClose })` where `start: GeoPoint`, `excludeIds: string[]`, `onPick: (poi: POI) => void`, `onClose: () => void`. On mount fetches `getPois({ lat: start.lat, lon: start.lon, distance_km: 5 })`; renders a `role="dialog"` listing candidates NOT in `excludeIds`, each row showing the name, fact count, and a "geen feiten" flag when `facts.length === 0`; clicking a row calls `onPick(poi)`; a close control calls `onClose`.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/components/PoiPicker.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { PoiPicker } from "./PoiPicker";
import type { POI } from "../../api/types";

afterEach(() => vi.restoreAllMocks());

const pois: POI[] = [
  { id: "p1", name: "Stadhuis", location: { lat: 52.38, lon: 4.63 }, facts: [{ key: "build_year", value: "1370", source: { name: "Wikidata", license: "CC0", reference: "q1" } }] },
  { id: "p2", name: "Vleeshal", location: { lat: 52.38, lon: 4.63 }, facts: [] },
  { id: "p3", name: "Al toegevoegd", location: { lat: 52.38, lon: 4.63 }, facts: [] },
];

test("lists candidates (excluding already-added) and picks one", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(pois), { status: 200 })));
  const onPick = vi.fn();
  render(
    <PoiPicker start={{ lat: 52.38, lon: 4.63 }} excludeIds={["p3"]} onPick={onPick} onClose={() => {}} />,
  );

  expect(await screen.findByText("Stadhuis")).toBeInTheDocument();
  expect(screen.getByText("Vleeshal")).toBeInTheDocument();
  expect(screen.queryByText("Al toegevoegd")).not.toBeInTheDocument(); // excluded
  expect(screen.getByText(/geen feiten/i)).toBeInTheDocument(); // Vleeshal has no facts

  await userEvent.click(screen.getByText("Stadhuis"));
  expect(onPick).toHaveBeenCalledWith(pois[0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PoiPicker`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `PoiPicker.tsx`**

Build a modal overlay (`position: fixed` backdrop + centered panel, `role="dialog"`, `aria-label="Stop toevoegen"`). On mount, `useEffect` calls `getPois(...)` into state (handle the `ApiError`/empty case by showing "Geen POI's gevonden"). Filter out `excludeIds`. Each candidate is a clickable row: name (`var(--tq-sans)`), a `SourceBadge`-free small "N feiten" / "geen feiten" tag (`facts.length`), calling `onPick(poi)` on click. A "Sluiten" button (and backdrop click) calls `onClose`. Use the design tokens for colors; this is a studio component, so match the studio's paper/sand palette. Keep it under ~120 lines.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- PoiPicker`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/components/PoiPicker.tsx frontend/src/studio/components/PoiPicker.test.tsx
git commit -m "feat(frontend): PoiPicker modal for adding real stops"
```

---

### Task 10: Rewire RouteEditor to the draft store

**Files:**
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (replace the mock data layer; keep the visual layout)
- Modify: `frontend/src/studio/screens/RouteEditor.test.tsx` (rewrite against the draft store)

**Interfaces:**
- Consumes: `useDraft()` (Task 8), `PoiPicker` (Task 9), `createDraft` via the store, `MapCanvas`/`Button`/`Chip`/`StudioChrome`.
- Produces: a RouteEditor driven by `useDraft().draft`.

Read the current `frontend/src/studio/screens/RouteEditor.tsx` first. Keep the JSX/layout (header, stop list, map, distance meter) but replace the data layer:

- Remove `MOCK_ROUTE_STOPS` and the local `stops` state. Use `const { draft, addStop, removeStop, reorder, setActiveStop, createDraft } = useDraft();`.
- On mount, if `!draft` and `localStorage["tq.studio.draft"]` exists, call `loadDraft(id)`; if neither, render an empty-state ("Nog geen tocht — maak er een via het dashboard of genereer een concept").
- Render the **start** as a non-removable first row (label "S", from `draft.start`, text "Startpunt · start"), then `draft.stops` as rows (order badge = `stop.order`, name = `stop.poi.name`, a "geen feiten" warning when `stop.poi.facts.length === 0`).
- Reorder ▲/▼ buttons call `reorder(stop.order, "up"|"down")` with `aria-label={`${stop.poi.name} omhoog`}` / `omlaag`; remove × calls `removeStop(stop.order)` with `aria-label={`${stop.poi.name} verwijderen`}`. Stop the row-click from firing on these (existing `stopPropagation` pattern).
- Row click → `setActiveStop(stop.order)` then `navigate("/studio/stop")`.
- Header title = `draft.title`; stat tiles: distance = `formatKm(draft.actual_distance_km)` (reuse a local comma-decimal formatter), duration from `draft.estimated_duration_min`, stops = `draft.stops.length`.
- Distance meter: show `formatKm(draft.actual_distance_km) + " km"`; the tolerance label is "binnen tolerantie ±15%" in green when `Math.abs(actual - requested) <= 0.15 * requested`, else "buiten tolerantie" in gold.
- The validation chip text: `${grounded} ok` where `grounded = draft.stops.filter(s => s.poi.facts.length > 0).length`, and `${draft.stops.length - grounded} waarschuwing` when > 0.
- "+ Stop toevoegen" opens `PoiPicker` (`start={draft.start}`, `excludeIds={draft.stops.map(s => s.poi.id)}`, `onPick={(poi) => { addStop(poi); setPickerOpen(false); }}`, `onClose`).
- "Genereer concept" → `createDraft({ start: draft?.start ?? { lat: 52.3812, lon: 4.6361 }, distance_km: 5, theme: "historical", from_concept: true })`.

- [ ] **Step 1: Rewrite the test**

Replace `frontend/src/studio/screens/RouteEditor.test.tsx` with:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DraftProvider, useDraft } from "../draftStore";
import { RouteEditor } from "./RouteEditor";
import type { DraftTrail, POI } from "../../api/types";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

const poi = (id: string, name: string, facts: POI["facts"] = []): POI => ({ id, name, location: { lat: 52.38, lon: 4.63 }, facts });

const draft = (stops: { order: number; poi: POI }[]): DraftTrail => ({
  id: "d1", title: "Haarlems Gouden Eeuw", city: "Haarlem", theme: "historical",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 5.2,
  estimated_duration_min: 110, stops, status: "concept", attributions: [],
});

function Harness({ seed }: { seed: DraftTrail }) {
  const { draft: d, createDraft } = useDraft();
  // seed the store by stubbing createDraft's fetch, then calling it once
  return (
    <>
      {!d && <button onClick={() => createDraft({ start: seed.start })}>seed</button>}
      {d && <RouteEditor />}
    </>
  );
}

test("renders real draft stops and the measured distance", async () => {
  const seeded = draft([
    { order: 1, poi: poi("p1", "Stadhuis", [{ key: "y", value: "1", source: { name: "Wikidata", license: "CC0", reference: "q" } }]) },
    { order: 2, poi: poi("p2", "Molen De Adriaan") },
  ]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(seeded), { status: 201 })));
  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));

  expect(await screen.findByText("Stadhuis")).toBeInTheDocument();
  expect(screen.getByText("Molen De Adriaan")).toBeInTheDocument();
  expect(screen.getAllByText("5,2 km").length).toBeGreaterThan(0); // distance meter from the draft
  expect(screen.getByText(/geen feiten/i)).toBeInTheDocument(); // p2 has no facts
});

test("opening the picker and choosing a candidate calls addStop (PUT)", async () => {
  const seeded = draft([]);
  const candidate: POI = { id: "c1", name: "Vleeshal", location: { lat: 52.38, lon: 4.63 }, facts: [] };
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith("/api/pois")) return Promise.resolve(new Response(JSON.stringify([candidate]), { status: 200 }));
    if (url === "/api/drafts/d1" ) return Promise.resolve(new Response(JSON.stringify(draft([{ order: 1, poi: candidate }])), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(seeded), { status: 201 })); // createDraft
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Stop toevoegen/i }));
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(within(dialog).getByText("Vleeshal"));

  // a PUT to /api/drafts/d1 with the new stop id was made
  await screen.findByText("Vleeshal", {}, { timeout: 2000 });
  const putCall = fetchMock.mock.calls.find((c) => c[0] === "/api/drafts/d1");
  expect(putCall).toBeTruthy();
  expect(JSON.parse(putCall![1].body).stop_poi_ids).toEqual(["c1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- RouteEditor`
Expected: FAIL (component still uses MOCK_ROUTE_STOPS / no picker).

- [ ] **Step 3: Rewire the component** per the Interfaces notes above. Keep the visual layout; swap only the data layer + add the `PoiPicker` open state.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- RouteEditor`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/RouteEditor.tsx frontend/src/studio/screens/RouteEditor.test.tsx
git commit -m "feat(frontend): RouteEditor wired to the live draft store"
```

---

### Task 11: Dashboard — real drafts + create

**Files:**
- Modify: `frontend/src/studio/screens/Dashboard.tsx` (fetch + render real drafts; create on "Nieuwe tocht")
- Modify: `frontend/src/studio/screens/Dashboard.test.tsx` (add a real-drafts test; keep the mock-cards assertions)

**Interfaces:**
- Consumes: `listDrafts` (`api/drafts`), `useDraft().createDraft` (Task 8), existing `MOCK_TRAILS`/`StudioChrome`/`useNavigate`.
- Produces: Dashboard listing real drafts alongside the mock cards; "Nieuwe tocht"/"Nieuwe tocht maken" creates a blank draft and navigates to `/studio/route`.

- On mount, `useEffect` → `listDrafts()` into state (on `ApiError`, keep an empty list — degrade). Render a real draft card per draft (title, theme, `formatKm(actual_distance_km)`, `stops.length` stops, status chip) BEFORE the existing `MOCK_TRAILS` cards (both render; mock cards stay so the page looks full).
- "Nieuwe tocht maken" / "Nieuwe tocht" → `await createDraft({ start: { lat: 52.3812, lon: 4.6361 }, distance_km: 5, theme: "mixed" })` then `navigate("/studio/route")`.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/screens/Dashboard.test.tsx` (keep existing tests):
```tsx
test("lists real drafts from the API alongside the mock cards", async () => {
  const drafts = [
    { id: "d1", title: "Mijn nieuwe tocht", city: "Haarlem", theme: "nature",
      start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 3.4,
      estimated_duration_min: 60, stops: [], status: "concept", attributions: [] },
  ];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(drafts), { status: 200 })));
  render(<MemoryRouter><DraftProvider><Dashboard /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText("Mijn nieuwe tocht")).toBeInTheDocument(); // real draft
  expect(screen.getByText("Verborgen hofjes")).toBeInTheDocument(); // mock card still there
});
```
Update this test file's imports to include `vi` from `vitest` and `DraftProvider` from `../draftStore`, and wrap the EXISTING render calls in `<DraftProvider>` too (the Dashboard now calls `useDraft`). For the existing tests that don't stub fetch, add `vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })))` in a `beforeEach`, and `afterEach(() => vi.restoreAllMocks())`, so `listDrafts()` on mount resolves to an empty list.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Dashboard`
Expected: FAIL (no real-draft rendering; possibly useDraft provider error).

- [ ] **Step 3: Implement** per the Interfaces notes. Add the `listDrafts` effect + real-draft cards + the create-and-navigate handler.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- Dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/Dashboard.tsx frontend/src/studio/screens/Dashboard.test.tsx
git commit -m "feat(frontend): Dashboard lists real drafts + creates one"
```

---

### Task 12: StopEditor opens the active draft stop

**Files:**
- Modify: `frontend/src/studio/screens/StopEditor.tsx` (read the active stop from the draft store; fall back to `MOCK_STOP`)
- Modify: `frontend/src/studio/screens/StopEditor.test.tsx` (add an active-stop test; keep existing `canGate`/word-count tests)

**Interfaces:**
- Consumes: `useDraft()` (Task 8); existing `MOCK_STOP`.
- Produces: the StopEditor header + locked Feiten zone reflect `draft.stops.find(s => s.order === activeStopOrder)?.poi` when present, else `MOCK_STOP.poi`.

Minimal change only: derive `const { draft, activeStopOrder } = useDraft();` and `const activePoi = draft?.stops.find(s => s.order === activeStopOrder)?.poi ?? MOCK_STOP.poi;`. Use `activePoi.name` for the title/header and `activePoi.facts` for the locked Feiten list (its real source badges). Do NOT change the Verhaal/Opdracht authoring behavior or the `canGate` logic.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/screens/StopEditor.test.tsx` (and wrap renders in `<DraftProvider>`; import `DraftProvider`/`useDraft` from `../draftStore`, `vi` from vitest):
```tsx
test("shows the active draft stop's POI when one is selected", async () => {
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return (
      <button
        onClick={async () => {
          // stub fetch so createDraft returns a draft with our POI as stop 1
          await createDraft({ start: { lat: 52.38, lon: 4.63 } });
          setActiveStop(1);
        }}
      >
        seed
      </button>
    );
  }
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] } }],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 201 })));
  render(
    <MemoryRouter>
      <DraftProvider>
        <Seed />
        <StopEditor />
      </DraftProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByText("seed"));
  expect(await screen.findByText("Waag")).toBeInTheDocument();
});
```
Ensure `userEvent`, `MemoryRouter`, and `vi` are imported in this test file (some may already be present).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- StopEditor`
Expected: FAIL ("Waag" not shown — StopEditor still hardcodes MOCK_STOP) or provider error.

- [ ] **Step 3: Implement** the `useDraft` read + `activePoi` fallback. The existing `canGate`/word-count tests must keep passing (those don't select an active stop, so the fallback to `MOCK_STOP` keeps them green).

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- StopEditor`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "feat(frontend): StopEditor opens the selected draft stop"
```

---

### Task 13: Full verification + README

**Files:**
- Modify: `frontend/README.md` (document the new studio behavior + endpoints)
- Modify: `backend/README.md` if it lists endpoints (add `/pois`, `/routes/measure`, `/drafts`)

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Backend full gate**

Run: `cd backend && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. If `ruff format --check` complains, run `ruff format .` and re-check (commit the formatting).

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all tests pass, typecheck clean, build succeeds.

- [ ] **Step 3: Update READMEs**

In `frontend/README.md`, add a short "Studio route creation" note: the studio now creates/persists real draft trails via the backend (`/drafts`), adds real POIs (`/pois`), and shows live distance (`/routes/measure`); without the backend the studio dashboard/editor will show empty/error states for drafts. In `backend/README.md`, add the three new endpoints to any endpoint list.

- [ ] **Step 4: Manual smoke (document, do not claim interactive execution)**

Add a manual checklist to `frontend/README.md`: with the backend running, `/studio` → "Nieuwe tocht maken" → lands on `/studio/route` with an empty draft → "+ Stop toevoegen" lists real Haarlem POIs → add two → distance meter updates → reorder/remove update it → click a stop opens it in the Stop editor → reload resumes the draft → it appears on the dashboard.

- [ ] **Step 5: Commit**

```bash
git add frontend/README.md backend/README.md
git commit -m "docs: studio route creation run notes + endpoints"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §4.1 schemas → T1; §4.2 measure_loop → T2; §4.4 DraftStore → T3; §4.3 draft_service → T4; §4.5 routers → T5 (pois/routes) + T6 (drafts) + main registration; §5.1 api → T7; §5.2 draftStore → T8; §5.4 PoiPicker → T9; §5.3 RouteEditor → T10; §5.5 Dashboard → T11; §5.6 StopEditor minimal change → T12; §7 testing → tests in every task; §8 out-of-scope respected (no Stop authoring/save, no Validation grounding, no publish, no delete/auth).
- **Save-model deviation from spec:** the spec said "debounced autosave"; the plan saves immediately per discrete mutation (one PUT/change). Documented in Global Constraints — the server still recomputes on each PUT, so the re-measure semantics are unchanged. (Reviewers: this is an intentional, documented simplification.)
- **Placeholder scan:** screen tasks (T10–T12) cite the existing files + give exact data-layer swaps and full test code; all backend/logic tasks give full code.
- **Type consistency:** `DraftTrail`/`DraftStop`/`DraftCreate`/`DraftUpdate`/`RouteMeasureResult` field names match between backend (T1) and frontend types (T7); `draft_service` fn names (`create/get/list_drafts/update`) match the API (T6); store action names (`createDraft/loadDraft/addStop/removeStop/reorder/setActiveStop`) are consistent across T8/T10/T11/T12; `measure_loop` signature matches T2↔T4↔T5; `stop_poi_ids` is the update key everywhere; the `cache.store.drafts` singleton vs the `app.api.drafts` module name collision is called out in T6.

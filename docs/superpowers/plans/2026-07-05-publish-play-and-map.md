# Publish → Playable Trails + Accurate Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A validated draft self-publishes into an immutable, persistent player `Trail`; players browse and play published trails; the route-editor map plots real coordinates.

**Architecture:** A `to_trail` converter snapshots a validated `DraftTrail` into a `Trail` (id reused). A `PublishedTrailStore` (memory/file) persists them. `POST /drafts/{id}/publish` converts + stores + flips status to `published`; `GET /trails` lists them; `GET /trails/{id}` + answer resolve published-then-active. The player gains a Browse landing. `MapCanvas` becomes coordinate-aware with a waypoint fallback.

**Tech Stack:** Python/FastAPI/Pydantic/pytest; Vite + React + TypeScript + Vitest + RTL.

## Global Constraints

- **Self-publish:** publish sets `status=published` AND creates the playable trail (no moderator role). Trail is an **immutable snapshot** with `trail.id = draft.id`, stops embedded by value.
- Published trails resolve **before** `active_trails` in `GET /trails/{id}` and answer; `GET /trails` lists only published trails.
- `MapCanvas` plots real coordinates when supplied, else the existing hardcoded waypoints (back-compat).
- Offline-safe; backend CI green (ruff/format/mypy/pytest); UI strings Dutch; degrade rather than break.
- Frontend: existing suites stay green; typecheck clean; no new `act(...)` warnings.

---

### Task 1: Backend — converter + `PublishedTrailStore` + config

**Files:**
- Modify: `backend/app/services/draft_service.py` (add `to_trail`)
- Modify: `backend/app/cache/store.py` (add `PublishedTrailStore` + backends + `published_trails`)
- Modify: `backend/app/cache/__init__.py` (export `published_trails`)
- Modify: `backend/app/config.py` (`published_store`, `published_store_path`)
- Modify: `backend/conftest.py` (isolate `published_store`), `backend/tests/conftest.py` (clear it)
- Test: `backend/tests/test_publish_trail.py`

**Interfaces:**
- Produces: `draft_service.to_trail(draft: DraftTrail) -> Trail`; `published_trails` (`put(trail)`, `get(id) -> Trail | None`, `list_trails() -> list[Trail]`, `clear()`).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_publish_trail.py`:
```python
from app.cache.store import InMemoryPublishedTrailStore
from app.models.schemas import (
    POI, DraftStop, DraftTrail, GeoPoint, Question, QuestionType, Theme, Trail,
)
from app.services import draft_service


def _draft() -> DraftTrail:
    poi = POI(id="p1", name="Grote Kerk", location=GeoPoint(lat=52.38, lon=4.63))
    q = Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")
    stop = DraftStop(id="p1::historical", order=1, poi=poi, story="Een verhaal.",
                     questions=[q], primary_question_index=0)
    return DraftTrail(id="d1", title="t", city="Haarlem", theme=Theme.HISTORICAL,
                      start=GeoPoint(lat=52.38, lon=4.63), requested_distance_km=5,
                      actual_distance_km=4.8, estimated_duration_min=60, stops=[stop, stop],
                      attributions=["Wikidata (CC0)"])


def test_to_trail_reuses_id_and_converts_stops():
    trail = draft_service.to_trail(_draft())
    assert isinstance(trail, Trail)
    assert trail.id == "d1"  # reuses the draft id
    assert trail.city == "Haarlem" and trail.theme == Theme.HISTORICAL
    assert trail.actual_distance_km == 4.8
    assert len(trail.stops) == 2
    s = trail.stops[0]
    assert s.story == "Een verhaal." and s.questions[0].answer == "78" and s.primary_question_index == 0
    assert trail.attributions == ["Wikidata (CC0)"]


def test_published_store_roundtrip():
    store = InMemoryPublishedTrailStore()
    trail = draft_service.to_trail(_draft())
    assert store.get("d1") is None
    store.put(trail)
    assert store.get("d1").id == "d1"
    assert [t.id for t in store.list_trails()] == ["d1"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_publish_trail.py -q`
Expected: FAIL (`to_trail`/`InMemoryPublishedTrailStore` missing).

- [ ] **Step 3: Implement the converter**

In `backend/app/services/draft_service.py`, ensure `Stop` and `Trail` are imported from `app.models.schemas`, and add:
```python
def to_trail(draft: DraftTrail) -> Trail:
    """Snapshot a validated draft into an immutable player Trail (reuses the draft id).

    Call only when ``validate(draft).can_publish`` — completeness (story, ≥1 question,
    valid primary) is assumed and asserted by the ``Stop`` model."""
    stops = [
        Stop(
            id=s.id,
            order=s.order,
            poi=s.poi,
            story=s.story or "",
            questions=s.questions,
            primary_question_index=s.primary_question_index or 0,
        )
        for s in draft.stops
    ]
    return Trail(
        id=draft.id,
        city=draft.city,
        theme=draft.theme,
        requested_distance_km=draft.requested_distance_km,
        actual_distance_km=draft.actual_distance_km,
        estimated_duration_min=draft.estimated_duration_min,
        start=draft.start,
        stops=stops,
        attributions=draft.attributions,
    )
```

- [ ] **Step 4: Implement the store + config + isolation**

In `backend/app/cache/store.py`, after the `ActiveTrailStore`/`active_trails` block, add (`Trail`, `Path`, `ABC`/`abstractmethod`, `settings` are already imported):
```python
class PublishedTrailStore(ABC):
    """Registry of published, playable trails (immutable snapshots)."""

    @abstractmethod
    def put(self, trail: Trail) -> None: ...
    @abstractmethod
    def get(self, trail_id: str) -> Trail | None: ...
    @abstractmethod
    def list_trails(self) -> list[Trail]: ...
    @abstractmethod
    def clear(self) -> None: ...


class InMemoryPublishedTrailStore(PublishedTrailStore):
    def __init__(self) -> None:
        self._trails: dict[str, Trail] = {}

    def put(self, trail: Trail) -> None:
        self._trails[trail.id] = trail

    def get(self, trail_id: str) -> Trail | None:
        return self._trails.get(trail_id)

    def list_trails(self) -> list[Trail]:
        return list(self._trails.values())

    def clear(self) -> None:
        self._trails.clear()


class FilePublishedTrailStore(PublishedTrailStore):
    """Persist each published trail as ``<id>.json`` (survives restarts)."""

    def __init__(self, dir_path: str) -> None:
        self._dir = Path(dir_path)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, trail_id: str) -> Path:
        return self._dir / f"{Path(trail_id).name}.json"

    def put(self, trail: Trail) -> None:
        self._path(trail.id).write_text(trail.model_dump_json(indent=2), encoding="utf-8")

    def get(self, trail_id: str) -> Trail | None:
        path = self._path(trail_id)
        if not path.exists():
            return None
        return Trail.model_validate_json(path.read_text(encoding="utf-8"))

    def list_trails(self) -> list[Trail]:
        return [
            Trail.model_validate_json(f.read_text(encoding="utf-8"))
            for f in sorted(self._dir.glob("*.json"))
        ]

    def clear(self) -> None:
        for f in self._dir.glob("*.json"):
            f.unlink()


def _build_published_store() -> PublishedTrailStore:
    if settings.published_store == "file":
        return FilePublishedTrailStore(settings.published_store_path)
    return InMemoryPublishedTrailStore()


published_trails: PublishedTrailStore = _build_published_store()
```

In `backend/app/config.py`, add near the draft-store settings:
```python
    published_store: str = "memory"
    published_store_path: str = "published"
```

In `backend/app/cache/__init__.py`, add `published_trails` to the `from app.cache.store import (...)` block and the `__all__`/exports (mirror `active_trails`).

In `backend/conftest.py`, add `os.environ["TRAILQUEST_PUBLISHED_STORE"] = "memory"`.

In `backend/tests/conftest.py`, import `published_trails` and add `published_trails.clear()` to the autouse `_clear_caches` fixture (alongside `content_cache.clear()` / `active_trails.clear()`).

- [ ] **Step 5: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_publish_trail.py -q && ruff check app && mypy app`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app backend/conftest.py backend/tests/
git commit -m "feat(backend): draft->Trail converter + PublishedTrailStore"
```

---

### Task 2: Backend — self-publish endpoint + list + resolve

**Files:**
- Modify: `backend/app/api/drafts.py` (`publish_draft`)
- Modify: `backend/app/api/trails.py` (`list_trails`, `get_trail`, `submit_answer` resolve)
- Test: `backend/tests/test_publish_api.py` (or `test_drafts_api.py`), `backend/tests/test_trails_api.py`

**Interfaces:**
- Consumes: `draft_service.to_trail`, `published_trails` (Task 1).
- Produces: `POST /drafts/{id}/publish` (self-publish); `GET /trails` (list published); `GET /trails/{id}` + answer resolve published-then-active.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_publish_api.py` (add; uses `TestClient`, `drafts`/`published_trails` cleared by conftest). Build a publishable draft with `from_concept` (seed POIs are grounded + generate story/questions):
```python
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import DraftCreate, GeoPoint
from app.services import draft_service

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


def _publishable_draft_id() -> str:
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM), from_concept=True))
    return d.id


def test_publish_creates_a_playable_trail():
    did = _publishable_draft_id()
    assert client.get(f"/drafts/{did}/validation").json()["can_publish"] is True
    r = client.post(f"/drafts/{did}/publish")
    assert r.status_code == 200 and r.json()["status"] == "published"
    # the published trail is now playable by the same id
    got = client.get(f"/trails/{did}")
    assert got.status_code == 200 and got.json()["id"] == did and len(got.json()["stops"]) >= 2
    # and it appears in the published list
    listed = client.get("/trails").json()
    assert did in [t["id"] for t in listed]


def test_publish_blocking_draft_is_409_and_creates_no_trail():
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))  # 0 stops → blocking
    assert client.post(f"/drafts/{d.id}/publish").status_code == 409
    assert client.get(f"/trails/{d.id}").status_code == 404


def test_answer_resolves_a_published_trail():
    did = _publishable_draft_id()
    client.post(f"/drafts/{did}/publish")
    trail = client.get(f"/trails/{did}").json()
    order = trail["stops"][0]["order"]
    r = client.post(f"/trails/{did}/answer", json={"stop_order": order, "answer": "x", "attempt": 1})
    assert r.status_code == 200  # resolves the published trail (not only active_trails)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_publish_api.py -q`
Expected: FAIL (publish sets `review`, no trail; `GET /trails` list missing).

- [ ] **Step 3: Implement**

In `backend/app/api/drafts.py`, import `published_trails` (`from app.cache import ... published_trails`) and replace the body of `publish_draft` after the 409 check:
```python
    published_trails.put(draft_service.to_trail(draft))
    updated = draft_service.update(draft_id, DraftUpdate(status=DraftStatus.PUBLISHED))
    assert updated is not None
    return updated
```

In `backend/app/api/trails.py`, change the import to `from app.cache import active_trails, published_trails` and add a resolver + list, and use the resolver in get/answer:
```python
def _resolve_trail(trail_id: str) -> Trail | None:
    return published_trails.get(trail_id) or active_trails.get(trail_id)


@router.get("", response_model=list[Trail])
def list_trails() -> list[Trail]:
    return published_trails.list_trails()
```
Replace `active_trails.get(trail_id)` with `_resolve_trail(trail_id)` in BOTH `get_trail` and `submit_answer`.

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the count. If `ruff format --check .` flags files, run `ruff format .`; `ruff check --fix .` for import-sort. Fix any existing publish test that asserted the old `status=="review"` behavior (it is now `published`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/ backend/tests/
git commit -m "feat(backend): self-publish creates a playable trail; GET /trails list + resolve"
```

---

### Task 3: Player — browse + play published trails

**Files:**
- Modify: `frontend/src/api/trails.ts` (`listTrails`)
- Modify: `frontend/src/quester/store.tsx` (`browse` phase + `goToConfigure`)
- Modify: `frontend/src/quester/QuesterApp.tsx` (browse case)
- Create: `frontend/src/quester/screens/Browse.tsx` (+ `Browse.test.tsx`)
- Modify: any quester test that assumed the `configure` default landing

**Interfaces:**
- Consumes: backend `GET /trails` (Task 2), existing `getTrail`.
- Produces: `listTrails()`; a `browse` landing that lists + plays published trails.

- [ ] **Step 1: Client + store + app wiring**

`frontend/src/api/trails.ts`: add
```ts
export const listTrails = () => apiFetch<Trail[]>("/trails");
```

`frontend/src/quester/store.tsx`:
- Add `"browse"` to the `Phase` union.
- Change `DEFAULT_STATE.phase` from `"configure"` to `"browse"`.
- Add a `goToConfigure` action to the `QuesterApi` interface and implementation:
  `goToConfigure: () => setState((s) => ({ ...s, phase: "configure" })),`.

`frontend/src/quester/QuesterApp.tsx`: import `Browse` and add `case "browse": return <Browse />;` (keep `default: return <Configure />`).

- [ ] **Step 2: Write the failing test**

`frontend/src/quester/screens/Browse.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { QuesterProvider } from "../store";
import QuesterApp from "../QuesterApp";

const TRAIL = {
  id: "d1", city: "Haarlem", theme: "historical", requested_distance_km: 5, actual_distance_km: 4.8,
  estimated_duration_min: 60, start: { lat: 52.38, lon: 4.63 },
  stops: [{ id: "p1::historical", order: 1, poi: { id: "p1", name: "Grote Kerk", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "s", questions: [{ type: "C", prompt: "?", answer: null, hint: null, gates: false }], primary_question_index: 0 }],
  attributions: [],
};

afterEach(() => vi.restoreAllMocks());

test("Browse lists published trails and plays one", async () => {
  const fetchMock = vi.fn((url: string) => {
    if (String(url).endsWith("/trails/d1")) return Promise.resolve(new Response(JSON.stringify(TRAIL), { status: 200 }));
    if (String(url).endsWith("/trails")) return Promise.resolve(new Response(JSON.stringify([TRAIL]), { status: 200 }));
    return Promise.resolve(new Response("[]", { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  render(<QuesterApp />);
  // the browse list shows the published trail
  expect(await screen.findByText(/Haarlem/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Speel/i }));
  // loading it by id advances into the preview flow (trail title/city visible in Preview)
  expect(await screen.findByText(/Voorvertoning|Start|Preview/i)).toBeInTheDocument();
});
```
(If the Preview screen's exact heading differs, assert a stable Preview element — read `Preview.tsx` and match its actual text/testid.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Browse`
Expected: FAIL (Browse missing).

- [ ] **Step 4: Implement `Browse.tsx`**

Mirror the studio card/list styling (CSS-var tokens, Dutch). On mount `listTrails()` into state (loading/empty/error). Render a heading (e.g. "Kies een tocht"), a card per trail (`{city} · {theme} · {formatKm(actual_distance_km)} km · {stops.length} stops`) with a "Speel" button → `getTrail(trail.id)` then `setTrail(trail)` (from `useQuester()`). Add a "Zelf genereren" button → `goToConfigure()`. Empty state: "Nog geen gepubliceerde tochten — genereer er zelf een." Use `useQuester()` for `setTrail`/`goToConfigure`.

- [ ] **Step 5: Fix quester tests that assumed the configure default**

Run `cd frontend && npm test -- quester` and update any test (e.g. `QuesterApp.test.tsx`, `store.test.tsx`) that relied on the app landing on `Configure`; either seed `phase: "configure"` via localStorage or click "Zelf genereren" first. Do not weaken assertions.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd frontend && npm test -- Browse quester && npm run typecheck`
Expected: PASS; clean; no new `act(...)` warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/trails.ts frontend/src/quester
git commit -m "feat(frontend): player Browse screen for published trails"
```

---

### Task 4: Studio — publish copy + play link

**Files:**
- Modify: `frontend/src/studio/screens/Validation.tsx`
- Modify: `frontend/src/studio/screens/Dashboard.tsx`
- Test: `frontend/src/studio/screens/Validation.test.tsx` (update)

**Interfaces:**
- Consumes: the now-direct-publish `POST /drafts/{id}/publish` (Task 2).

- [ ] **Step 1: Update the copy + link**

In `frontend/src/studio/screens/Validation.tsx`: on successful publish, show **"Gepubliceerd — Live"** and a **"Speel in de app"** link — an `<a href="/play">…</a>` (the player browse, where the trail now appears). Replace the "Verzonden naar moderatie" / "naar moderatie" strings with the direct-publish copy (keep the disabled-when-blocking behavior + the 409 error path). The publish button can read "Publiceren".

In `frontend/src/studio/screens/Dashboard.tsx`: on a card whose `status === "published"`, render a small **"Speel in app"** `<a href="/play">` link (near the "gepubliceerd" footer text). The `published`→"Live" badge already exists.

- [ ] **Step 2: Update the Validation test**

In `frontend/src/studio/screens/Validation.test.tsx`, the clean-publish test asserts the new success copy: after clicking publish, `findByText(/Gepubliceerd|Live/i)` and a link `getByRole("link", { name: /Speel/i })` with `href="/play"`. Update any assertion on the old "moderatie" text.

- [ ] **Step 3: Run tests + typecheck**

Run: `cd frontend && npm test -- Validation && npm run typecheck`
Expected: PASS; clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/studio/screens/Validation.tsx frontend/src/studio/screens/Dashboard.tsx frontend/src/studio/screens/Validation.test.tsx
git commit -m "feat(frontend): studio direct-publish copy + Speel-in-app link"
```

---

### Task 5: Accurate route map (`MapCanvas` coordinates)

**Files:**
- Modify: `frontend/src/design-system/primitives/MapCanvas.tsx`
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (`mapStops` with coords)
- Test: `frontend/src/design-system/primitives/MapCanvas.test.tsx` (new)

**Interfaces:**
- Produces: `projectStops(stops, width, height) -> {order,label,x,y}[]` (exported pure fn); `MapCanvas` `stops` gain optional `lat`/`lon`.

- [ ] **Step 1: Write the failing test**

`frontend/src/design-system/primitives/MapCanvas.test.tsx`:
```tsx
import { expect, test } from "vitest";
import { projectStops } from "./MapCanvas";

test("projectStops fits real coordinates to the canvas bounding box (lat inverted)", () => {
  const stops = [
    { order: 0, label: "S", lat: 52.30, lon: 4.60 },  // SW corner
    { order: 1, label: "1", lat: 52.40, lon: 4.80 },  // NE corner
  ];
  const pts = projectStops(stops, 400, 800);
  // east (higher lon) → larger x; north (higher lat) → smaller y (inverted)
  expect(pts[1].x).toBeGreaterThan(pts[0].x);
  expect(pts[1].y).toBeLessThan(pts[0].y);
  // within padded bounds
  for (const p of pts) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(400);
  }
});

test("projectStops falls back to waypoints when no coordinates are given", () => {
  const pts = projectStops([{ order: 1, label: "1" }, { order: 2, label: "2" }], 360, 764);
  expect(pts).toHaveLength(2);
  expect(pts[0].x).not.toBeNaN();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- MapCanvas`
Expected: FAIL (`projectStops` not exported).

- [ ] **Step 3: Implement**

In `frontend/src/design-system/primitives/MapCanvas.tsx`, widen the `stops` type to `{ order: number; label: string; lat?: number; lon?: number }[]`, extract and export a pure projector, and use it in the component (replace the inline `pts` computation):
```tsx
export function projectStops(
  stops: { order: number; label: string; lat?: number; lon?: number }[],
  width: number,
  height: number,
): { order: number; label: string; x: number; y: number }[] {
  const coords = stops.filter((s) => s.lat != null && s.lon != null);
  if (coords.length === 0) {
    return stops.map((s, i) => {
      const [nx, ny] = WAYPOINTS[i % WAYPOINTS.length];
      return { order: s.order, label: s.label, x: nx * width, y: ny * height };
    });
  }
  const lats = coords.map((s) => s.lat as number);
  const lons = coords.map((s) => s.lon as number);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const spanLat = maxLat - minLat || 1, spanLon = maxLon - minLon || 1;
  const pad = 44;
  return stops.map((s) => {
    const x = s.lon != null ? pad + ((s.lon - minLon) / spanLon) * (width - 2 * pad) : width / 2;
    const y = s.lat != null ? pad + ((maxLat - s.lat) / spanLat) * (height - 2 * pad) : height / 2;
    return { order: s.order, label: s.label, x, y };
  });
}
```
In the component body replace the `const pts = stops.map(...)` line with `const pts = projectStops(stops, width, height);` (the `routeD` and pin/label rendering below are unchanged — they read `pts[i].x/y`, `p.order`, `p.label`).

In `frontend/src/studio/screens/RouteEditor.tsx`, build `mapStops` with real coordinates (start as the "S" point):
```tsx
const mapStops = [
  { order: 0, label: "S", lat: draft.start.lat, lon: draft.start.lon },
  ...draft.stops.map((s) => ({ order: s.order, label: String(s.order), lat: s.poi.location.lat, lon: s.poi.location.lon })),
];
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test -- MapCanvas RouteEditor && npm run typecheck`
Expected: PASS; clean. (Other `MapCanvas` callers pass no coords → waypoint fallback, unaffected.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/primitives/MapCanvas.tsx frontend/src/studio/screens/RouteEditor.tsx frontend/src/design-system/primitives/MapCanvas.test.tsx
git commit -m "feat(frontend): coordinate-aware MapCanvas; route editor plots real POIs"
```

---

### Task 6: Full verification + README

- [ ] **Backend gate:** `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app` — report count.
- [ ] **Frontend gate:** `cd frontend && npm test && npm run typecheck && npm run build` — report count (pre-existing "Body has already been read" stderr noise is not a failure).
- [ ] **READMEs:** `backend/README.md` — publish now self-publishes into a persistent, playable `Trail` (id reused, immutable snapshot); `GET /trails` lists published trails; `GET /trails/{id}`+answer resolve published-then-active; `TRAILQUEST_PUBLISHED_STORE=file` for durable published trails. `frontend/README.md` — the player lands on a Browse screen (published trails; "Zelf genereren" for on-demand); the studio publishes directly to Live with a "Speel in app" link; `MapCanvas` plots real coordinates in the route editor. Verify against code.
- [ ] Commit `docs: publish→playable trails + accurate map`.

## Self-review (completed during planning)

- **Spec coverage:** A.1 converter → T1; A.2 store → T1; A.3 endpoints → T2; A.4 player browse → T3; A.5 studio copy → T4; B map → T5; testing → tests in each; out-of-scope (no moderator/reject, no tiles, no deep-link, RouteEditor-only map) respected.
- **Placeholder scan:** T1/T2/T5 give full code; T3/T4 cite files with exact edits + full tests, and flag updating the quester default-landing tests + the old "review"/"moderatie" assertions.
- **Type consistency:** `to_trail`/`published_trails` (T1) consumed by the endpoints (T2); `trail.id == draft.id` reused consistently; `listTrails`/`getTrail`/`setTrail`/`goToConfigure` (T3); `projectStops` signature (T5) matches its RouteEditor caller and the test; the `browse` phase + default landing are consistent across store + QuesterApp (T3).

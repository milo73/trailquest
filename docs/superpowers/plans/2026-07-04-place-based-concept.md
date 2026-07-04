# Place-Based Concept Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the studio homepage, let a creator generate a concept trail by typing a place name + distance + theme + optional stop count — geocode the place, retrieve real POIs around it, build a loop, and AI-author each stop.

**Architecture:** A new Nominatim geocoding client turns a place name into coordinates + a city label. `DraftCreate` gains `place` (and an optional `start`); `draft_service.create` resolves place→start+city and raises `ValueError` (→ existing global 422 handler) on failure. For a geocoded place, the Haarlem-seed fallback is disabled so a place with no real POIs errors instead of mislabelling Haarlem stops. A `NewTrailForm` modal on the Dashboard drives it.

**Tech Stack:** Python/FastAPI/Pydantic/httpx/pytest; Vite + React + TypeScript + Vitest + RTL.

## Global Constraints

- Content-accuracy: real OSM/Wikidata POIs only. For a geocoded place, do NOT fall back to the Haarlem seed; a place with < 2 grounded POIs → a clear Dutch error.
- Geocode failure (not found OR client error) → `ValueError` → 422 (global handler at `app/main.py:30`) → shown in the form; create nothing.
- Nominatim: `settings.nominatim_url`, `format=jsonv2&limit=1&addressdetails=1`, mandatory `User-Agent`, `timeout=settings.http_timeout`; degrade via `ClientError` like the other clients.
- Offline-safe (all HTTP mocked in tests, via `monkeypatch.setattr(<module>.httpx, "get", …)`); backend CI green (ruff/format/mypy/pytest); UI strings Dutch.
- Frontend: existing suites stay green; typecheck clean; no new `act(...)` warnings.

---

### Task 1: Nominatim geocoding client + config

**Files:**
- Create: `backend/app/clients/nominatim.py`
- Modify: `backend/app/config.py` (add `nominatim_url`)
- Test: `backend/tests/test_clients.py` (add cases)

**Interfaces:**
- Produces: `nominatim.geocode(query: str) -> GeoResult | None`; `GeoResult{lat: float, lon: float, city: str, display_name: str}`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_clients.py` (reuse the existing `_FakeResponse`; add `nominatim` to the `from app.clients import ...` line):
```python
def test_nominatim_geocode_returns_coords_and_city(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = [{"lat": "52.409", "lon": "4.617", "display_name": "Bloemendaal, Noord-Holland, Nederland",
                "address": {"village": "Bloemendaal", "municipality": "Bloemendaal"}}]
    monkeypatch.setattr(nominatim.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    got = nominatim.geocode("Bloemendaal")
    assert got is not None
    assert round(got.lat, 3) == 52.409 and round(got.lon, 3) == 4.617
    assert got.city == "Bloemendaal"


def test_nominatim_geocode_city_falls_back_to_display_name(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = [{"lat": "1.0", "lon": "2.0", "display_name": "Ergens, Land"}]  # no address block
    monkeypatch.setattr(nominatim.httpx, "get", lambda *a, **k: _FakeResponse(payload))
    assert nominatim.geocode("Ergens").city == "Ergens"


def test_nominatim_geocode_none_when_no_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nominatim.httpx, "get", lambda *a, **k: _FakeResponse([]))
    assert nominatim.geocode("Nergensland") is None


def test_nominatim_raises_client_error_on_http_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nominatim.httpx, "get", lambda *a, **k: _FakeResponse({}, status=500))
    with pytest.raises(ClientError):
        nominatim.geocode("X")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clients.py -k nominatim -q`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the client**

`backend/app/clients/nominatim.py`:
```python
"""Place-name geocoding via Nominatim (OpenStreetMap, ODbL).

Free, no API key; the usage policy REQUIRES a descriptive User-Agent and permits
~1 req/s (fine for interactive creator use). Returns coordinates + a best-effort
place label; never invents a location.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.clients import ClientError
from app.config import settings

_HEADERS = {"User-Agent": "TrailQuest/0.1 (+https://github.com/milo73/trailquest)"}


@dataclass(frozen=True)
class GeoResult:
    lat: float
    lon: float
    city: str
    display_name: str


def geocode(query: str) -> GeoResult | None:
    """Geocode a free-text place. None when not found; ClientError on transport/parse failure."""
    try:
        resp = httpx.get(
            settings.nominatim_url,
            params={"q": query, "format": "jsonv2", "limit": 1, "addressdetails": 1},
            timeout=settings.http_timeout,
            headers=_HEADERS,
        )
        resp.raise_for_status()
        results = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ClientError(f"Nominatim request failed for {query!r}: {exc}") from exc

    if not results:
        return None
    top = results[0]
    addr = top.get("address", {})
    display = top.get("display_name", query)
    city = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("suburb")
        or display.split(",")[0].strip()
    )
    return GeoResult(lat=float(top["lat"]), lon=float(top["lon"]), city=city, display_name=display)
```

In `backend/app/config.py`, add near the other `*_url` settings:
```python
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_clients.py -q && ruff check app && mypy app/clients/nominatim.py`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/clients/nominatim.py backend/app/config.py backend/tests/test_clients.py
git commit -m "feat(backend): Nominatim geocoding client"
```

---

### Task 2: `DraftCreate.place` + geocoding in `draft_service.create`

**Files:**
- Modify: `backend/app/models/schemas.py` (`DraftCreate`)
- Modify: `backend/app/services/draft_service.py` (`create`)
- Test: `backend/tests/test_draft_service.py` (or the file testing `create` — find via `grep -rl "draft_service.create" backend/tests`), `backend/tests/test_drafts_api.py`

**Interfaces:**
- Consumes: `nominatim.geocode` (Task 1).
- Produces: `DraftCreate{..., place: str | None = None, start: GeoPoint | None = None}`; `create` resolves place→start+city (priority place > start > default-city coords), raising `ValueError` on geocode failure.

- [ ] **Step 1: Write the failing test**

Add to the draft-create test file (monkeypatch the geocoder to stay offline):
```python
def test_create_with_place_sets_start_and_city(monkeypatch):
    from app.clients import nominatim
    from app.clients.nominatim import GeoResult
    from app.models.schemas import DraftCreate
    from app.services import draft_service

    monkeypatch.setattr(nominatim, "geocode", lambda q: GeoResult(lat=52.41, lon=4.62, city="Bloemendaal", display_name="Bloemendaal, NL"))
    draft = draft_service.create(DraftCreate(place="Bloemendaal"))
    assert draft.city == "Bloemendaal"
    assert round(draft.start.lat, 2) == 52.41 and round(draft.start.lon, 2) == 4.62


def test_create_place_not_found_raises(monkeypatch):
    from app.clients import nominatim
    from app.models.schemas import DraftCreate
    from app.services import draft_service
    import pytest

    monkeypatch.setattr(nominatim, "geocode", lambda q: None)
    with pytest.raises(ValueError):
        draft_service.create(DraftCreate(place="Nergensland"))


def test_create_place_client_error_raises(monkeypatch):
    from app.clients import ClientError, nominatim
    from app.models.schemas import DraftCreate
    from app.services import draft_service
    import pytest

    def _boom(q):
        raise ClientError("down")
    monkeypatch.setattr(nominatim, "geocode", _boom)
    with pytest.raises(ValueError):
        draft_service.create(DraftCreate(place="X"))


def test_create_without_place_uses_start_and_default_city():
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service
    draft = draft_service.create(DraftCreate(start=GeoPoint(lat=52.38, lon=4.63)))
    assert draft.city == "Haarlem"
    assert draft.start.lat == 52.38
```

And in `backend/tests/test_drafts_api.py` (uses `TestClient`, clears `drafts`):
```python
def test_create_with_unknown_place_returns_422(monkeypatch):
    from app.clients import nominatim
    monkeypatch.setattr(nominatim, "geocode", lambda q: None)
    r = client.post("/drafts", json={"place": "Nergensland"})
    assert r.status_code == 422
    assert "niet gevonden" in r.json()["detail"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_drafts_api.py -q -k place`
Expected: FAIL (no `place` field / no geocoding).

- [ ] **Step 3: Implement**

In `backend/app/models/schemas.py`, update `DraftCreate`:
```python
class DraftCreate(BaseModel):
    title: str | None = None
    place: str | None = None
    start: GeoPoint | None = None
    distance_km: float = Field(default=5, ge=1, le=25)
    theme: Theme = Theme.MIXED
    from_concept: bool = False
    desired_stops: int | None = Field(default=None, ge=2, le=15)
```

In `backend/app/services/draft_service.py`, add `ClientError, nominatim` to the `from app.clients import ...` (or add `from app.clients import ClientError, nominatim`) and resolve start/city at the top of `create`:
```python
def create(req: DraftCreate) -> DraftTrail:
    start = req.start
    city = settings.default_city
    if req.place and req.place.strip():
        try:
            geo = nominatim.geocode(req.place.strip())
        except ClientError as exc:
            raise ValueError(f"Plaats kon niet worden opgezocht: {req.place}") from exc
        if geo is None:
            raise ValueError(f"Plaats '{req.place}' niet gevonden")
        start = GeoPoint(lat=geo.lat, lon=geo.lon)
        city = geo.city
    if start is None:
        start = GeoPoint(lat=settings.default_city_lat, lon=settings.default_city_lon)

    draft = DraftTrail(
        id=str(uuid.uuid4()),
        title=req.title or "Nieuwe tocht",
        city=city,
        theme=req.theme,
        start=start,
        requested_distance_km=req.distance_km,
        actual_distance_km=0.0,
        estimated_duration_min=0,
        stops=[],
    )
    if req.from_concept:
        trail = route_service.generate_trail(
            TrailRequest(
                start=start,
                distance_km=req.distance_km,
                theme=req.theme,
                desired_stops=req.desired_stops,
            )
        )
        draft.stops = [
            DraftStop(
                order=s.order,
                poi=s.poi,
                story=s.story,
                questions=s.questions,
                primary_question_index=s.primary_question_index,
            )
            for s in trail.stops
        ]
    _measure(draft)
    drafts.put(draft)
    return draft
```
(The seed-fallback gate + thin-concept guard land in Task 3.)

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_drafts_api.py tests/test_draft_service.py -q && ruff check app && mypy app`
Expected: PASS; clean. (mypy: `draft.start` is now resolved to a non-None `GeoPoint` before the `DraftTrail(...)` — the local `start` is guaranteed non-None by the `if start is None` guard.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/schemas.py backend/app/services/draft_service.py backend/tests/
git commit -m "feat(backend): DraftCreate.place geocoded to start+city (422 on failure)"
```

---

### Task 3: Seed-fallback gate + thin-concept guard (content-accuracy)

**Files:**
- Modify: `backend/app/services/poi_service.py` (`candidates`)
- Modify: `backend/app/services/route_service.py` (`generate_trail` threads the flag)
- Modify: `backend/app/services/draft_service.py` (pass the flag + the thin-concept guard)
- Test: `backend/tests/test_draft_service.py` (or the create-test file)

**Interfaces:**
- Produces: `poi_service.candidates(near, distance_km, allow_seed_fallback=True)`; `route_service.generate_trail(req, *, allow_seed_fallback=True)`; `draft_service.create` passes `allow_seed_fallback=(req.place is None)` and raises `ValueError` when a geocoded place yields < 2 grounded stops.

- [ ] **Step 1: Write the failing test**

Add to the create-test file:
```python
def test_create_from_place_with_no_pois_raises(monkeypatch):
    from app.clients import nominatim
    from app.clients.nominatim import GeoResult
    from app.models.schemas import DraftCreate
    from app.services import draft_service, poi_service
    import pytest

    monkeypatch.setattr(nominatim, "geocode", lambda q: GeoResult(lat=1.0, lon=2.0, city="Verweg", display_name="Verweg"))
    # a geocoded place must NOT fall back to the Haarlem seed → no candidates → error
    monkeypatch.setattr(poi_service, "_fetch_live", lambda near, dist: [])
    monkeypatch.setattr(poi_service.settings, "poi_source", "live")
    with pytest.raises(ValueError):
        draft_service.create(DraftCreate(place="Verweg", from_concept=True))


def test_candidates_seed_fallback_disabled_returns_empty(monkeypatch):
    from app.models.schemas import GeoPoint
    from app.services import poi_service
    monkeypatch.setattr(poi_service, "_fetch_live", lambda near, dist: [])
    monkeypatch.setattr(poi_service.settings, "poi_source", "live")
    assert poi_service.candidates(GeoPoint(lat=1.0, lon=2.0), 5, allow_seed_fallback=False) == []
    # default (True) still falls back to the seed set
    assert len(poi_service.candidates(GeoPoint(lat=1.0, lon=2.0), 5)) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_draft_service.py -q -k "seed or no_pois"`
Expected: FAIL (`candidates` has no `allow_seed_fallback`).

- [ ] **Step 3: Implement**

In `backend/app/services/poi_service.py`, add the parameter and gate the fallback:
```python
def candidates(near: GeoPoint, distance_km: float, allow_seed_fallback: bool = True) -> list[POI]:
    if settings.poi_source == "live":
        try:
            live = _fetch_live(near, distance_km)
            if live:
                return live
            logger.warning("live POI source returned nothing; %s",
                           "using seed set" if allow_seed_fallback else "no seed fallback (geocoded place)")
        except ClientError as exc:
            logger.warning("live POI source failed (%s); %s", exc,
                           "using seed set" if allow_seed_fallback else "no seed fallback (geocoded place)")
    if not allow_seed_fallback:
        return []
    return list(_HAARLEM_POIS)
```

In `backend/app/services/route_service.py`, thread the flag:
```python
def generate_trail(req: TrailRequest, *, allow_seed_fallback: bool = True) -> Trail:
    candidates = poi_service.candidates(req.start, req.distance_km, allow_seed_fallback)
    ...
```

In `backend/app/services/draft_service.py` `create`, pass the flag and add the guard after the stop-copy:
```python
    if req.from_concept:
        trail = route_service.generate_trail(
            TrailRequest(start=start, distance_km=req.distance_km, theme=req.theme, desired_stops=req.desired_stops),
            allow_seed_fallback=req.place is None,
        )
        draft.stops = [ ... ]  # unchanged
        if req.place and len(draft.stops) < 2:
            raise ValueError(f"Geen geschikte POI's gevonden rond '{req.place}'")
```

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the count. Fix any existing `candidates(...)`/`generate_trail(...)` caller if the added params break it (both are additive with defaults — should not). If `ruff format --check .` flags files, run `ruff format .`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ backend/tests/
git commit -m "feat(backend): no Haarlem-seed fallback for geocoded places; thin-concept guard"
```

---

### Task 4: Frontend — `NewTrailForm` + types + generate timeout

**Files:**
- Modify: `frontend/src/api/types.ts` (`DraftCreate`)
- Modify: `frontend/src/api/drafts.ts` (`createDraft` timeout)
- Create: `frontend/src/studio/components/NewTrailForm.tsx`
- Test: `frontend/src/studio/components/NewTrailForm.test.tsx`

**Interfaces:**
- Consumes: `DraftCreate.place` (Task 2), `apiFetch`'s `{ timeoutMs }`.
- Produces: `NewTrailForm` modal → `onSubmit(req: DraftCreate)`; `createDraft` uses a long timeout for `from_concept`.

- [ ] **Step 1: Types + timeout**

In `frontend/src/api/types.ts`, update `DraftCreate`: add `place?: string;` and make `start?: GeoPoint;`.

In `frontend/src/api/drafts.ts`, change `createDraft`:
```ts
export const createDraft = (req: DraftCreate) =>
  apiFetch<DraftTrail>("/drafts", { method: "POST", body: JSON.stringify(req) },
    { timeoutMs: req.from_concept ? 180000 : 15000 });
```

- [ ] **Step 2: Write the failing test**

`frontend/src/studio/components/NewTrailForm.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { NewTrailForm } from "./NewTrailForm";

test("submits place + distance + theme + from_concept and omits blank stops", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<NewTrailForm submitting={false} onClose={() => {}} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText(/plaats/i), "Bloemendaal");
  await userEvent.selectOptions(screen.getByLabelText(/thema/i), "nature");
  await userEvent.click(screen.getByRole("button", { name: /genereer/i }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    place: "Bloemendaal", theme: "nature", from_concept: true,
  }));
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("desired_stops");
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("start");
});

test("shows the error when onSubmit rejects and stays open", async () => {
  const onSubmit = vi.fn().mockRejectedValue({ name: "ApiError", status: 422, message: "Plaats 'x' niet gevonden" });
  render(<NewTrailForm submitting={false} onClose={() => {}} onSubmit={onSubmit} />);
  await userEvent.type(screen.getByLabelText(/plaats/i), "x");
  await userEvent.click(screen.getByRole("button", { name: /genereer/i }));
  expect(await screen.findByText(/niet gevonden/i)).toBeInTheDocument();
});

test("submit is disabled until a place is entered", () => {
  render(<NewTrailForm submitting={false} onClose={() => {}} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /genereer/i })).toBeDisabled();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- NewTrailForm`
Expected: FAIL (component missing).

- [ ] **Step 4: Implement `NewTrailForm.tsx`**

Read `frontend/src/studio/components/CustomStopForm.tsx` and mirror its structure (backdrop `div` + centered `role="dialog"` panel + header with a "Sluiten" button + labeled `<form>`, CSS-var tokens). Props: `{ submitting: boolean; onClose: () => void; onSubmit: (req: DraftCreate) => Promise<void> }`. Fields:
- `Plaats` — `<input type="text" aria-label="Plaats">` (required).
- `Afstand (km)` — `<input type="number" min={1} max={25} aria-label="Afstand">`, default `"5"`.
- `Thema` — `<select aria-label="Thema">` with options over the 6 `Theme` values and Dutch labels: `historical`→"Historisch", `hidden_gems`→"Verborgen parels", `family`→"Familie", `architecture`→"Architectuur", `nature`→"Natuur", `mixed`→"Gemengd" (default `mixed`).
- `Aantal stops (optioneel)` — `<input type="number" min={2} max={15} aria-label="Aantal stops" placeholder="auto">`.
- Local `error: string | null`. `canSubmit = place.trim() !== "" && !submitting`.
- Submit handler (prevent default): build
  ```ts
  const req: DraftCreate = { place: place.trim(), distance_km: Number(distanceKm) || 5, theme, from_concept: true,
    ...(desiredStops.trim() ? { desired_stops: Number(desiredStops) } : {}) };
  setError(null);
  try { await onSubmit(req); } catch (e) { setError((e as { message?: string }).message ?? "Genereren mislukt"); }
  ```
  Render `error` inline (red-toned) above the submit button. The submit button reads "Genereer concept" (disabled when `!canSubmit`); while `submitting`, show "Bezig met genereren… dit kan even duren".

- [ ] **Step 5: Run tests + typecheck**

Run: `cd frontend && npm test -- NewTrailForm drafts && npm run typecheck`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/drafts.ts frontend/src/studio/components/NewTrailForm.tsx frontend/src/studio/components/NewTrailForm.test.tsx
git commit -m "feat(frontend): NewTrailForm (place/distance/theme/stops) + generate timeout"
```

---

### Task 5: Dashboard wiring

**Files:**
- Modify: `frontend/src/studio/screens/Dashboard.tsx`
- Test: `frontend/src/studio/screens/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `NewTrailForm` (Task 4), `useDraft().createDraft`.
- Produces: the "Nieuwe tocht maken" card opens the form; submit generates + navigates to `/studio/route`.

Read the current `Dashboard.tsx` (`handleCreate` ~line 218, the "Nieuwe tocht maken" card ~line 305) and `Dashboard.test.tsx`.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/screens/Dashboard.test.tsx` (match its existing render/`vi.stubGlobal("fetch", …)` pattern):
```tsx
test("Nieuwe tocht maken opens the form and generates a concept", async () => {
  const created = { id: "d1", title: "t", city: "Bloemendaal", theme: "nature", start: { lat: 52.4, lon: 4.6 },
    requested_distance_km: 5, actual_distance_km: 4.8, estimated_duration_min: 60, stops: [], status: "concept", attributions: [] };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/drafts") && init?.method === "POST")
      return Promise.resolve(new Response(JSON.stringify(created), { status: 201 }));
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 })); // GET /drafts
  });
  vi.stubGlobal("fetch", fetchMock);
  render(/* the file's existing Dashboard render wrapper */);
  await userEvent.click(await screen.findByText(/Nieuwe tocht maken/i));
  await userEvent.type(await screen.findByLabelText(/plaats/i), "Bloemendaal");
  await userEvent.click(screen.getByRole("button", { name: /genereer/i }));
  const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
  expect(JSON.parse((post![1] as RequestInit).body as string)).toMatchObject({ place: "Bloemendaal", from_concept: true });
});
```
(Assert navigation the way the file already does — e.g. a `<Routes>` marker for `/studio/route`, or a mocked `useNavigate`. Match the existing Dashboard test setup.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Dashboard`
Expected: FAIL (card creates a blank draft; no form).

- [ ] **Step 3: Implement**

In `frontend/src/studio/screens/Dashboard.tsx`:
- Add `const [modalOpen, setModalOpen] = useState(false);` and import `NewTrailForm`.
- The "Nieuwe tocht maken" card's `onClick` → `setModalOpen(true)` (remove the old instant `handleCreate` create).
- Add a `handleGenerate(req: DraftCreate)` that sets `creating`, `await createDraft(req)`, on success `setModalOpen(false)` + `navigate("/studio/route")`; on error **rethrow** so the form shows it; `finally` reset `creating`.
- Render `{modalOpen && <NewTrailForm submitting={creating} onClose={() => setModalOpen(false)} onSubmit={handleGenerate} />}`.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all PASS/clean; build ok. Report the test count. Update the previous Dashboard test if it asserted the old instant-create behavior.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/Dashboard.tsx frontend/src/studio/screens/Dashboard.test.tsx
git commit -m "feat(frontend): Dashboard 'Nieuwe tocht' opens the concept form"
```

---

## Task 6: Verify + README

- [ ] **Backend + frontend full gates** (`pytest -q && ruff check . && ruff format --check . && mypy app`; `npm test && npm run typecheck && npm run build`) — report counts.
- [ ] **READMEs**: `backend/README.md` — `POST /drafts` accepts `place` (geocoded via Nominatim to start + city; 422 on not-found; geocoded places don't fall back to the Haarlem seed). `frontend/README.md` — the studio homepage "Nieuwe tocht" form (plaats/afstand/thema/aantal → AI concept). Add `TRAILQUEST_NOMINATIM_URL` if you document env vars. Verify against code.
- [ ] Commit `docs: place-based concept creation`.

## Self-review (completed during planning)

- **Spec coverage:** geocoding client → T1; place→start+city + 422 → T2; seed-fallback gate + thin-concept guard → T3; form + timeout → T4; Dashboard wiring → T5; verify+docs → T6.
- **Type consistency:** `GeoResult`/`geocode` (T1) consumed by `create` (T2); `DraftCreate.place`/optional `start` identical in backend (T2) + frontend (T4); `candidates(..., allow_seed_fallback)` + `generate_trail(..., allow_seed_fallback=)` threaded (T3); `NewTrailForm` `onSubmit(DraftCreate)` (T4) consumed by Dashboard (T5).

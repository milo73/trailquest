# Desired Stop Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let route generation take an optional `desired_stops` count (default → today's distance-derived count), threaded into POI selection, with a studio-only "aantal stops" input on concept generation.

**Architecture:** `desired_stops` is added to `TrailRequest`/`DraftCreate`, flows into `route_service._select_pois` (clamped to `[2, grounded-POI-count]`), and is surfaced in the studio RouteEditor's "Genereer concept". No persistence change.

**Tech Stack:** Python/FastAPI/Pydantic/pytest; Vite + React + TypeScript + Vitest + RTL.

## Global Constraints

- `desired_stops: int | None`, bounded `Field(default=None, ge=2, le=15)`; when `None`, count is distance-derived (`max(2, round(distance_km))`) exactly as today.
- Clamp the target to `[2, len(with_facts)]` (graceful degrade when fewer grounded POIs exist).
- Studio-only UI (RouteEditor concept generation); the player create stays distance-only (PRD §19). Not persisted.
- Offline-safe; backend CI green (`ruff check`, `ruff format --check`, `mypy app`, `pytest`); UI strings Dutch.
- Frontend: existing suites stay green; `npm run typecheck` clean; no new `act(...)` warnings.

---

### Task 1: Backend — `desired_stops` input threaded into POI selection

**Files:**
- Modify: `backend/app/models/schemas.py` (`TrailRequest`, `DraftCreate`)
- Modify: `backend/app/services/route_service.py` (`_select_pois`, `generate_trail`)
- Modify: `backend/app/services/draft_service.py` (`create` from_concept branch)
- Test: `backend/tests/test_desired_stops.py`

**Interfaces:**
- Produces: `TrailRequest.desired_stops: int | None`, `DraftCreate.desired_stops: int | None`; `_select_pois(candidates, distance_km, desired_stops=None)`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_desired_stops.py`:
```python
from app.models.schemas import DraftCreate, GeoPoint, POI, Fact, Source, SourceLicense, TrailRequest
from app.services import draft_service, route_service

HAARLEM = GeoPoint(lat=52.3812, lon=4.6361)


def _poi(i: int) -> POI:
    return POI(
        id=f"p{i}", name=f"POI {i}", location=GeoPoint(lat=52.38 + i / 1000, lon=4.63),
        facts=[Fact(key="build_year", value=str(1500 + i), source=Source(name="Wikidata", license=SourceLicense.CC0, reference=f"q{i}"))],
    )


def test_select_pois_honors_desired_stops():
    candidates = [_poi(i) for i in range(10)]
    assert len(route_service._select_pois(candidates, 5.0, desired_stops=3)) == 3


def test_select_pois_clamps_to_available():
    candidates = [_poi(i) for i in range(3)]
    # asked for more than exist → clamp to the 3 grounded POIs
    assert len(route_service._select_pois(candidates, 5.0, desired_stops=9)) == 3


def test_select_pois_falls_back_to_distance_when_none():
    candidates = [_poi(i) for i in range(10)]
    # distance 5 → round(5)=5 stops, no desired_stops
    assert len(route_service._select_pois(candidates, 5.0)) == 5


def test_draft_create_from_concept_honors_desired_stops():
    draft = draft_service.create(DraftCreate(start=HAARLEM, distance_km=5, from_concept=True, desired_stops=3))
    # seed set is small; the count reflects the request clamped to grounded seed POIs
    assert len(draft.stops) <= 3 and len(draft.stops) >= 2


def test_trailrequest_desired_stops_bounds():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        TrailRequest(start=HAARLEM, distance_km=5, desired_stops=1)  # below ge=2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_desired_stops.py -q`
Expected: FAIL (`_select_pois` takes 2 args; `desired_stops` unknown field).

- [ ] **Step 3: Add the schema fields**

In `backend/app/models/schemas.py`, add to `TrailRequest`:
```python
    desired_stops: int | None = Field(default=None, ge=2, le=15)
```
and to `DraftCreate`:
```python
    desired_stops: int | None = Field(default=None, ge=2, le=15)
```

- [ ] **Step 4: Thread it through route/draft services**

In `backend/app/services/route_service.py`, replace `_select_pois` + its call:
```python
def _select_pois(
    candidates: list[POI], distance_km: float, desired_stops: int | None = None
) -> list[POI]:
    """Pick POIs with verifiable facts. Uses ``desired_stops`` when given, else
    roughly one stop per kilometre; clamps to the number of grounded POIs.

    Prefer no stop over a wrong stop: fact-less POIs are dropped (PRD §8.3, §13).
    """
    with_facts = [p for p in candidates if p.has_verifiable_facts]
    target = desired_stops if desired_stops is not None else max(2, round(distance_km))
    target = max(2, min(target, len(with_facts)))
    return with_facts[:target]
```
And in `generate_trail`, change the call to:
```python
    selected = _select_pois(candidates, req.distance_km, req.desired_stops)
```

In `backend/app/services/draft_service.py` `create`, pass it into the internal `TrailRequest`:
```python
        trail = route_service.generate_trail(
            TrailRequest(
                start=req.start, distance_km=req.distance_km, theme=req.theme,
                desired_stops=req.desired_stops,
            )
        )
```

- [ ] **Step 5: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count. If `ruff format --check .` flags files, run `ruff format .`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/schemas.py backend/app/services/route_service.py backend/app/services/draft_service.py backend/tests/test_desired_stops.py
git commit -m "feat(backend): desired_stops input threaded into POI selection"
```

---

### Task 2: Frontend — types + studio "aantal stops" input

**Files:**
- Modify: `frontend/src/api/types.ts` (`TrailRequest`, `DraftCreate`)
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (`handleGenereer` + an input)
- Test: `frontend/src/studio/screens/RouteEditor.test.tsx` (add a case)

**Interfaces:**
- Consumes: `DraftCreate.desired_stops` (Task 1 wire shape).
- Produces: a studio input that passes `desired_stops` to `createDraft(..., from_concept: true)`.

- [ ] **Step 1: Add the types**

In `frontend/src/api/types.ts`, add `desired_stops?: number;` to `interface TrailRequest` and `interface DraftCreate`.

- [ ] **Step 2: Add the failing test**

Read the current `RouteEditor.tsx` (`handleGenereer` at ~line 115 creates a concept draft) and `RouteEditor.test.tsx` first. Append to `RouteEditor.test.tsx` (use the file's existing seed/stub pattern):
```tsx
test("Genereer concept passes desired_stops when the aantal-stops input is set", async () => {
  const seeded = draft([]);
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(seeded), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.type(screen.getByLabelText(/aantal stops/i), "4");
  await userEvent.click(screen.getByRole("button", { name: /Genereer concept/i }));
  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);
  expect(body.desired_stops).toBe(4);
  expect(body.from_concept).toBe(true);
});
```
(If the existing `Harness`/`draft` helpers differ, match them; assert the POST body of the `createDraft` call.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- RouteEditor`
Expected: FAIL (no "aantal stops" input; `desired_stops` not sent).

- [ ] **Step 4: Implement**

In `frontend/src/studio/screens/RouteEditor.tsx`:
- Add local state near the other RouteEditor state: `const [desiredStops, setDesiredStops] = useState<string>("");`
- Render a small numeric input next to the "Genereer concept" control:
```tsx
<input
  type="number"
  min={2}
  max={15}
  aria-label="Aantal stops"
  placeholder="auto"
  value={desiredStops}
  onChange={(e) => setDesiredStops(e.target.value)}
  style={{ width: 72, height: 40, padding: "0 10px", borderRadius: 10, border: "1px solid #e0d5bf", background: "#fff", font: "600 13px/1 var(--tq-sans)", color: "#283a5e" }}
/>
```
- In `handleGenereer`, build the payload with `desired_stops` only when set:
```tsx
    const parsed = parseInt(desiredStops, 10);
    await createDraft({
      start: draft?.start ?? { lat: 52.3812, lon: 4.6361 },
      distance_km: 5,
      theme: "historical",
      from_concept: true,
      ...(Number.isFinite(parsed) ? { desired_stops: parsed } : {}),
    });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd frontend && npm test -- RouteEditor && npm run typecheck`
Expected: PASS; clean; no new `act(...)` warnings.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/studio/screens/RouteEditor.tsx frontend/src/studio/screens/RouteEditor.test.tsx
git commit -m "feat(frontend): studio aantal-stops input on concept generation"
```

---

### Task 3: Full verification + README

**Files:**
- Modify: `backend/README.md`, `frontend/README.md`

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: tests pass (pre-existing "Body has already been read" stderr noise is not a failure), typecheck clean, build ok. Report the test count.

- [ ] **Step 3: Update READMEs**

`backend/README.md`: note `TrailRequest`/`DraftCreate` accept an optional `desired_stops` (2–15) that sets the stop count (clamped to grounded POIs; distance-derived when omitted). `frontend/README.md`: note the studio concept-generation has an "aantal stops" input (blank = auto); the player create stays distance-only. Verify against the code.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md frontend/README.md
git commit -m "docs: desired_stops generation input"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3 backend (schemas + `_select_pois` + threading) → T1; §4 frontend (types + studio input) → T2; §5 testing → tests in T1/T2; §6 out-of-scope (no player input, not persisted) respected.
- **Placeholder scan:** T1 gives full code; T2 cites the file + gives the exact input/handler edits and full test (matching the file's existing seed/stub pattern).
- **Type consistency:** `desired_stops` name + `int | None` / `number` bounds identical across `TrailRequest`/`DraftCreate` (T1) and the frontend types (T2); `_select_pois(candidates, distance_km, desired_stops=None)` used consistently by `generate_trail`.

# Studio Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/studio/validate` compute its pre-publish report from the real draft (server-authoritative) and make "Publiceren naar moderatie" a real, gated action that sets the draft to `review`.

**Architecture:** Backend `draft_service.validate(draft)` computes checks + per-stop grounding + a `can_publish` verdict; `GET /drafts/{id}/validation` serves it and `POST /drafts/{id}/publish` re-validates (409 if blocking) then sets `status="review"`. Frontend gains the types + two clients, rewires the Validation screen to fetch/render the real report with a gated publish, and adds a "Publiceren" nav button to the route editor.

**Tech Stack:** Python/FastAPI/Pydantic/pytest (backend); Vite + React + TypeScript + Vitest + RTL (frontend).

## Source-of-truth convention

Backend tasks give full Python. Frontend logic tasks (types, clients) give full TypeScript. The screen rewire (Validation) modifies an existing file — the plan cites it and specifies exact data-layer swaps, and gives **full test code**. Read the current file before editing.

Backend runs from `backend/` after `source .venv/bin/activate`. Frontend from `frontend/` with `npm test`.

## Global Constraints

- **Server-authoritative gate:** `POST /publish` re-validates and returns **409** when `can_publish` is false. The UI also disables the button, but the server is the gate.
- **Blocking rules:** `< 2` stops; any stop missing `story` or `question`; any factless stop (`poi.facts == []`). **Warning (still publishable):** distance outside ±15% of requested.
- **Publish target:** `status = DraftStatus.REVIEW` ("review").
- **Wire field names snake_case** to match the API JSON (`per_stop`, `can_publish`).
- Offline-safe; backend CI green (`ruff check`, `ruff format --check`, `mypy app`, `pytest`); UI strings Dutch; no `window.confirm/alert/prompt`.
- Frontend: existing player + studio suites stay green; `npm run typecheck` clean; no `act(...)` warnings.
- A pre-existing Starlette/httpx `StarletteDeprecationWarning` in pytest output is not a failure — ignore it.

---

### Task 1: Validation schemas + `draft_service.validate`

**Files:**
- Modify: `backend/app/models/schemas.py` (append validation models)
- Modify: `backend/app/services/draft_service.py` (add `validate`)
- Test: `backend/tests/test_validate.py`

**Interfaces:**
- Produces: `CheckStatus` (StrEnum ok/warning/blocking), `StopGrounding`, `ValidationCheck`, `ValidationResult`; `draft_service.validate(draft: DraftTrail) -> ValidationResult`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_validate.py`:
```python
from app.models.schemas import (
    POI,
    DraftStop,
    DraftTrail,
    Fact,
    GeoPoint,
    Question,
    QuestionType,
    Source,
    SourceLicense,
)
from app.services import draft_service


def _fact() -> Fact:
    return Fact(key="height_m", value="78", source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"))


def _stop(order: int, *, facts: bool = True, content: bool = True) -> DraftStop:
    poi = POI(id=f"p{order}", name=f"Stop {order}", location=GeoPoint(lat=52.38, lon=4.63), facts=[_fact()] if facts else [])
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="?") if content else None
    return DraftStop(order=order, poi=poi, story="Een verhaal." if content else None, question=q)


def _draft(stops, *, requested=5.0, actual=5.0) -> DraftTrail:
    return DraftTrail(
        id="d1", title="t", city="Haarlem", theme="historical",
        start=GeoPoint(lat=52.38, lon=4.63), requested_distance_km=requested,
        actual_distance_km=actual, estimated_duration_min=60, stops=stops,
    )


def test_complete_grounded_intolerance_draft_can_publish():
    result = draft_service.validate(_draft([_stop(1), _stop(2)]))
    assert result.can_publish is True
    assert result.blocking == 0
    assert all(s.grounded for s in result.per_stop)


def test_too_few_stops_blocks():
    result = draft_service.validate(_draft([_stop(1)]))
    assert result.can_publish is False
    assert any(c.id == "stops" and c.status == "blocking" for c in result.checks)


def test_factless_stop_blocks_grounding():
    result = draft_service.validate(_draft([_stop(1), _stop(2, facts=False)]))
    assert result.can_publish is False
    assert any(c.id == "grounding" and c.status == "blocking" for c in result.checks)
    assert result.per_stop[1].grounded is False
    assert result.per_stop[1].sources == "geen feiten"


def test_incomplete_content_blocks():
    result = draft_service.validate(_draft([_stop(1), _stop(2, content=False)]))
    assert result.can_publish is False
    assert any(c.id == "content" and c.status == "blocking" for c in result.checks)


def test_distance_out_of_tolerance_is_a_warning_not_blocking():
    result = draft_service.validate(_draft([_stop(1), _stop(2)], requested=5.0, actual=9.0))
    assert result.can_publish is True  # warning only
    assert result.warnings >= 1
    assert any(c.id == "distance" and c.status == "warning" for c in result.checks)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_validate.py -q`
Expected: FAIL (ImportError / AttributeError: validate).

- [ ] **Step 3: Add the schemas**

Append to `backend/app/models/schemas.py`:
```python
class CheckStatus(StrEnum):
    OK = "ok"
    WARNING = "warning"
    BLOCKING = "blocking"


class StopGrounding(BaseModel):
    order: int
    name: str
    grounded: bool
    sources: str


class ValidationCheck(BaseModel):
    id: str
    label: str
    detail: str
    status: CheckStatus


class ValidationResult(BaseModel):
    checks: list[ValidationCheck]
    per_stop: list[StopGrounding]
    blocking: int
    warnings: int
    can_publish: bool
```

- [ ] **Step 4: Add `validate`**

In `backend/app/services/draft_service.py`, add `CheckStatus`, `StopGrounding`, `ValidationCheck`, `ValidationResult` to the `from app.models.schemas import (...)` block, and add:
```python
def validate(draft: DraftTrail) -> ValidationResult:
    """Compute the pre-publish report for a draft (PRD: quality is a gate)."""
    stops = draft.stops
    per_stop: list[StopGrounding] = []
    for s in stops:
        source_names = sorted({f.source.name for f in s.poi.facts})
        per_stop.append(
            StopGrounding(
                order=s.order,
                name=s.poi.name,
                grounded=len(s.poi.facts) > 0,
                sources=" · ".join(source_names) if source_names else "geen feiten",
            )
        )

    checks: list[ValidationCheck] = []

    checks.append(
        ValidationCheck(
            id="stops",
            label="Stops",
            detail=f"{len(stops)} stops",
            status=CheckStatus.BLOCKING if len(stops) < 2 else CheckStatus.OK,
        )
    )

    complete = [s for s in stops if s.story and s.story.strip() and s.question is not None]
    checks.append(
        ValidationCheck(
            id="content",
            label="Inhoud compleet",
            detail=f"{len(complete)} / {len(stops)} stops hebben verhaal + opdracht",
            status=CheckStatus.BLOCKING if len(complete) < len(stops) else CheckStatus.OK,
        )
    )

    grounded = [s for s in stops if s.poi.facts]
    checks.append(
        ValidationCheck(
            id="grounding",
            label="Grounding",
            detail=f"{len(grounded)} / {len(stops)} stops met verifieerbare feiten",
            status=CheckStatus.BLOCKING if len(grounded) < len(stops) else CheckStatus.OK,
        )
    )

    req = draft.requested_distance_km
    out_of_tolerance = req > 0 and abs(draft.actual_distance_km - req) > 0.15 * req
    checks.append(
        ValidationCheck(
            id="distance",
            label="Afstandstolerantie",
            detail=f"{draft.actual_distance_km} km — doel {req} km (±15%)",
            status=CheckStatus.WARNING if out_of_tolerance else CheckStatus.OK,
        )
    )

    blocking = sum(1 for c in checks if c.status == CheckStatus.BLOCKING)
    warnings = sum(1 for c in checks if c.status == CheckStatus.WARNING)
    return ValidationResult(
        checks=checks,
        per_stop=per_stop,
        blocking=blocking,
        warnings=warnings,
        can_publish=blocking == 0,
    )
```

- [ ] **Step 5: Run test + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_validate.py -q && ruff check app && mypy app`
Expected: PASS (5 passed); clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/schemas.py backend/app/services/draft_service.py backend/tests/test_validate.py
git commit -m "feat(backend): draft_service.validate + validation schemas"
```

---

### Task 2: Validation + publish endpoints

**Files:**
- Modify: `backend/app/api/drafts.py` (two routes)
- Test: `backend/tests/test_publish_api.py`

**Interfaces:**
- Consumes: `draft_service.validate`/`get`/`update` (Task 1 + existing); `ValidationResult`, `DraftStatus`, `DraftUpdate`, `DraftTrail`.
- Produces: `GET /drafts/{draft_id}/validation` → `ValidationResult` (404 unknown); `POST /drafts/{draft_id}/publish` → `DraftTrail` (404 unknown, 409 when blocking, else status→review).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_publish_api.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app
from app.models.schemas import DraftCreate, DraftUpdate, GeoPoint
from app.services import draft_service, poi_service

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def _publishable_draft_id() -> str:
    # from_concept builds grounded stops with story+question; ≥2 stops near Haarlem
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM), theme="historical", from_concept=True))
    return d.id


def test_get_validation_shape():
    draft_id = _publishable_draft_id()
    r = client.get(f"/drafts/{draft_id}/validation")
    assert r.status_code == 200
    body = r.json()
    assert {"checks", "per_stop", "blocking", "warnings", "can_publish"} <= set(body.keys())


def test_publish_success_sets_review():
    draft_id = _publishable_draft_id()
    # ensure it is publishable (concept generation grounds + fills content)
    assert client.get(f"/drafts/{draft_id}/validation").json()["can_publish"] is True
    r = client.post(f"/drafts/{draft_id}/publish")
    assert r.status_code == 200
    assert r.json()["status"] == "review"
    assert client.get(f"/drafts/{draft_id}").json()["status"] == "review"


def test_publish_blocked_is_409():
    # a blank draft has 0 stops → blocking
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    r = client.post(f"/drafts/{d.id}/publish")
    assert r.status_code == 409
    # status unchanged
    assert client.get(f"/drafts/{d.id}").json()["status"] == "concept"


def test_publish_and_validation_unknown_are_404():
    assert client.get("/drafts/nope/validation").status_code == 404
    assert client.post("/drafts/nope/publish").status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_publish_api.py -q`
Expected: FAIL (404/405 on the new routes).

- [ ] **Step 3: Add the routes**

In `backend/app/api/drafts.py`, add `DraftStatus, ValidationResult` to the schema import, and add:
```python
@router.get("/{draft_id}/validation", response_model=ValidationResult)
def get_validation(draft_id: str) -> ValidationResult:
    draft = draft_service.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft_service.validate(draft)


@router.post("/{draft_id}/publish", response_model=DraftTrail)
def publish_draft(draft_id: str) -> DraftTrail:
    draft = draft_service.get(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    report = draft_service.validate(draft)
    if not report.can_publish:
        raise HTTPException(
            status_code=409,
            detail=f"Kan niet publiceren: {report.blocking} blokkerende issue(s)",
        )
    updated = draft_service.update(draft_id, DraftUpdate(status=DraftStatus.REVIEW))
    assert updated is not None  # draft existed above
    return updated
```

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. If `ruff format --check .` flags files, run `ruff format .` and include it.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/drafts.py backend/tests/test_publish_api.py
git commit -m "feat(backend): GET /validation + POST /publish (409 gate, status->review)"
```

---

### Task 3: Frontend API — validation types + clients

**Files:**
- Modify: `frontend/src/api/types.ts` (validation types)
- Modify: `frontend/src/api/drafts.ts` (2 clients)
- Test: `frontend/src/api/drafts.test.ts` (add cases)

**Interfaces:**
- Produces: `CheckStatus`, `StopGrounding`, `ValidationCheck`, `ValidationResult`; `getValidation(draftId) -> Promise<ValidationResult>` (GET `/drafts/{id}/validation`); `publishDraft(draftId) -> Promise<DraftTrail>` (POST `/drafts/{id}/publish`).

- [ ] **Step 1: Add the types**

Append to `frontend/src/api/types.ts`:
```ts
export type CheckStatus = "ok" | "warning" | "blocking";

export interface StopGrounding {
  order: number;
  name: string;
  grounded: boolean;
  sources: string;
}

export interface ValidationCheck {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
}

export interface ValidationResult {
  checks: ValidationCheck[];
  per_stop: StopGrounding[];
  blocking: number;
  warnings: number;
  can_publish: boolean;
}
```

- [ ] **Step 2: Add the clients**

In `frontend/src/api/drafts.ts`, add `ValidationResult` to the `import type { … } from "./types"` block and add:
```ts
export const getValidation = (draftId: string) =>
  apiFetch<ValidationResult>(`/drafts/${draftId}/validation`);

export const publishDraft = (draftId: string) =>
  apiFetch<DraftTrail>(`/drafts/${draftId}/publish`, { method: "POST" });
```

- [ ] **Step 3: Add the failing test**

Append to `frontend/src/api/drafts.test.ts` (add `getValidation, publishDraft` to the existing import from `./drafts`):
```ts
test("getValidation GETs the validation path", async () => {
  const report = { checks: [], per_stop: [], blocking: 0, warnings: 0, can_publish: true };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const res = await getValidation("d1");
  expect(res.can_publish).toBe(true);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/drafts/d1/validation");
});

test("publishDraft POSTs to the publish path and throws ApiError on 409", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "d1", status: "review" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await publishDraft("d1");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/drafts/d1/publish");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Kan niet publiceren" }), { status: 409 })));
  await expect(publishDraft("d1")).rejects.toMatchObject({ name: "ApiError", status: 409 });
});
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- drafts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): validation types + getValidation/publishDraft clients"
```

---

### Task 4: Validation screen — real report + gated publish

**Files:**
- Modify: `frontend/src/studio/screens/Validation.tsx`
- Modify: `frontend/src/studio/screens/Validation.test.tsx` (rewrite)
- (After this task, `frontend/src/studio/mock/validation.ts` is unused — leave it or delete it; do not import it from the screen.)

**Interfaces:**
- Consumes: `useDraft()` (`draft`, `loadDraft`), `getValidation`/`publishDraft` (Task 3), `ValidationResult` (Task 3), `useNavigate`.
- Produces: a Validation screen driven by the server report with a gated publish.

Read the current `frontend/src/studio/screens/Validation.tsx` first. Keep the layout/markup (checks list with `data-testid="checks-list"`, the blocking/warning summary cards incl. `data-testid="warning-count-card"`, the per-stop grounding list, the publish button + "Verzonden naar moderatie" confirmation). Replace the data layer:

1. Remove `import { VALIDATION_REPORT }` and `const report = VALIDATION_REPORT`.
2. Add:
```tsx
const { draft, loadDraft } = useDraft();
const navigate = useNavigate(); // from react-router-dom
const [report, setReport] = useState<ValidationResult | null>(null);
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState(false);
const [published, setPublished] = useState(false);
const [publishError, setPublishError] = useState<string | null>(null);

// mount-load the active draft (pattern from StopEditor)
useEffect(() => {
  if (!draft) {
    const savedId = localStorage.getItem("tq.studio.draft");
    if (savedId) loadDraft(savedId);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps

// fetch the report when a draft is available
useEffect(() => {
  if (!draft) return;
  setLoading(true);
  setLoadError(false);
  getValidation(draft.id)
    .then((r) => setReport(r))
    .catch(() => setLoadError(true))
    .finally(() => setLoading(false));
}, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

async function handlePublish() {
  if (!draft || !report || report.blocking > 0) return;
  setPublishError(null);
  try {
    await publishDraft(draft.id);
    setPublished(true);
  } catch {
    setPublishError("Kan nog niet publiceren — los de blokkerende issues op.");
  }
}
```
3. Render:
   - When `loading` → "Rapport laden…"; when `loadError` → "Kon het validatierapport niet laden"; when there's no draft at all → "Geen tocht geselecteerd — open er een via het dashboard".
   - The checks list from `report.checks` — style each by `status`: `blocking` (terracotta/red), `warning` (gold), `ok` (green). Keep `data-testid="checks-list"`.
   - The blocking/warning summary cards from `report.blocking` / `report.warnings` (keep `data-testid="warning-count-card"` on the warning card; add `data-testid="blocking-count-card"` on the blocking card).
   - The per-stop grounding list from `report.per_stop` (name + `sources`, grounded ✓ / not-grounded warning).
   - "Publiceren naar moderatie" `disabled={!report || report.blocking > 0}`; `onClick={handlePublish}`; when `published`, show "Verzonden naar moderatie"; when `publishError`, show it.
   - A "← Terug naar route-editor" button → `navigate("/studio/route")`.
4. Do not import the mock report anywhere.

- [ ] **Step 1: Rewrite the test**

Replace `frontend/src/studio/screens/Validation.test.tsx` with:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DraftProvider } from "../draftStore";
import { Validation } from "./Validation";

const DRAFT = {
  id: "d1", title: "t", city: "Haarlem", theme: "historical",
  start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 5,
  estimated_duration_min: 60, stops: [], status: "concept", attributions: [],
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    checks: [
      { id: "grounding", label: "Grounding", detail: "1 / 2 stops met verifieerbare feiten", status: "blocking" },
      { id: "distance", label: "Afstandstolerantie", detail: "5 km — doel 5 km (±15%)", status: "ok" },
    ],
    per_stop: [
      { order: 1, name: "Grote Markt", sources: "Wikidata", grounded: true },
      { order: 2, name: "Mijn plek", sources: "geen feiten", grounded: false },
    ],
    blocking: 1, warnings: 0, can_publish: false,
    ...overrides,
  };
}

beforeEach(() => localStorage.setItem("tq.studio.draft", "d1"));
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

function stub(routes: (url: string) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(routes(String(url)))));
}

test("renders the real per-stop grounding and disables publish when blocking", async () => {
  stub((url) =>
    url.endsWith("/validation")
      ? new Response(JSON.stringify(report()), { status: 200 })
      : new Response(JSON.stringify(DRAFT), { status: 200 }),
  );
  render(<MemoryRouter><DraftProvider><Validation /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText("Mijn plek")).toBeInTheDocument();
  expect(screen.getByText("geen feiten")).toBeInTheDocument();
  expect(within(screen.getByTestId("blocking-count-card")).getByText("1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Publiceren naar moderatie/i })).toBeDisabled();
});

test("a clean report publishes to moderation", async () => {
  stub((url) => {
    if (url.endsWith("/validation"))
      return new Response(JSON.stringify(report({ checks: [{ id: "grounding", label: "Grounding", detail: "2 / 2", status: "ok" }], per_stop: [{ order: 1, name: "A", sources: "Wikidata", grounded: true }, { order: 2, name: "B", sources: "Wikidata", grounded: true }], blocking: 0, can_publish: true })), { status: 200 });
    if (url.endsWith("/publish"))
      return new Response(JSON.stringify({ ...DRAFT, status: "review" }), { status: 200 });
    return new Response(JSON.stringify(DRAFT), { status: 200 });
  });
  render(<MemoryRouter><DraftProvider><Validation /></DraftProvider></MemoryRouter>);
  const btn = await screen.findByRole("button", { name: /Publiceren naar moderatie/i });
  expect(btn).not.toBeDisabled();
  await userEvent.click(btn);
  expect(await screen.findByText(/Verzonden naar moderatie/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Validation`
Expected: FAIL (screen still renders the mock; no fetch-driven report).

- [ ] **Step 3: Implement** the Validation rewire per the notes above.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test -- Validation && npm run typecheck`
Expected: PASS; clean. No `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/Validation.tsx frontend/src/studio/screens/Validation.test.tsx
git commit -m "feat(frontend): Validation screen renders the real report + gated publish"
```

---

### Task 5: RouteEditor — "Publiceren" nav button

**Files:**
- Modify: `frontend/src/studio/screens/RouteEditor.tsx` (add a header action button)
- Modify: `frontend/src/studio/screens/RouteEditor.test.tsx` (add a case)

**Interfaces:**
- Consumes: `useNavigate` (already used in RouteEditor).
- Produces: a "Publiceren" button in the header actions → `navigate("/studio/validate")`.

Read the current RouteEditor first. In the header actions area (where the "Voorvertoning" button is rendered), add a "Publiceren" button next to it:
```tsx
<button
  onClick={() => navigate("/studio/validate")}
  style={{
    height: 40, padding: "0 16px", borderRadius: 10,
    border: "1px solid #cbbfa6", background: "#fff",
    font: "600 13px/1 var(--tq-sans)", color: "#283a5e", cursor: "pointer",
  }}
>
  Publiceren
</button>
```
(Match the existing "Voorvertoning" button's styling; `navigate` is already in scope in RouteEditor.)

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/screens/RouteEditor.test.tsx`:
```tsx
test("the Publiceren button navigates to /studio/validate", async () => {
  const seeded = draft([]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(seeded), { status: 201 })));
  render(
    <MemoryRouter initialEntries={["/studio/route"]}>
      <DraftProvider>
        <Routes>
          <Route path="/studio/route" element={<Harness seed={seeded} />} />
          <Route path="/studio/validate" element={<div>VALIDATIE PAGINA</div>} />
        </Routes>
      </DraftProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /^Publiceren$/i }));
  expect(await screen.findByText("VALIDATIE PAGINA")).toBeInTheDocument();
});
```
Add `Route, Routes` to the existing `react-router-dom` import in the test file. If the file's `Harness` renders the RouteEditor only when a draft exists, the "seed" button (which calls `createDraft`) makes it appear, then the Publiceren button is present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- RouteEditor`
Expected: FAIL (no "Publiceren" button).

- [ ] **Step 3: Implement** the button.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- RouteEditor`
Expected: PASS (existing + new). No `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/RouteEditor.tsx frontend/src/studio/screens/RouteEditor.test.tsx
git commit -m "feat(frontend): RouteEditor Publiceren button -> /studio/validate"
```

---

### Task 6: Full verification + README

**Files:**
- Modify: `frontend/README.md`, `backend/README.md`

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all tests pass (no new `act(...)` warnings; the suite has pre-existing "Body has already been read" unhandled-rejection stderr noise — that is pre-existing, not a failure), typecheck clean, build succeeds. Report the test count.

- [ ] **Step 3: Update READMEs**

`backend/README.md`: add `GET /drafts/{id}/validation` (the pre-publish report: checks + per-stop grounding + blocking/warning counts + `can_publish`) and `POST /drafts/{id}/publish` (re-validates; 409 if blocking, else sets `status=review`) to the endpoint table. Verify paths/behavior against `backend/app/api/drafts.py`. `frontend/README.md`: note the Validation screen is now real — server-computed report, a publish gated on `can_publish` that sets the draft to `review`, reachable via the route editor's "Publiceren" button; and the blocking rules (< 2 stops / incomplete content / factless stop) with distance-out-of-tolerance as a warning. Add a manual smoke line (do NOT claim an interactive run): open a draft → "Publiceren" → the report shows real grounding; a factless/custom stop blocks publish; remove it → publish → the dashboard shows the trail "In review".

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md backend/README.md
git commit -m "docs: studio validation/publish endpoints + run notes"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3.1 schemas + §3.2 validate → T1; §3.3 endpoints → T2; §4.1 api → T3; §4.2 Validation screen → T4; §4.3 navigation → T5; §6 testing → tests in every task; §7 out-of-scope respected (no moderation queue, no publish→player-Trail conversion, no Stop-editor entry point).
- **Placeholder scan:** the screen task (T4) cites the existing file + gives exact data-layer swaps and full test code; backend/logic tasks give full code.
- **Type consistency:** `ValidationResult`/`ValidationCheck`/`StopGrounding`/`CheckStatus` field names (`per_stop`, `can_publish`, `status`) match backend (T1) and frontend (T3); `validate` (T1) ↔ the `/validation` route + `publish` route (T2) ↔ `getValidation`/`publishDraft` clients (T3) ↔ the screen (T4); `DraftStatus.REVIEW`/`"review"` used consistently; the blocking rule (`blocking == 0 → can_publish`) is defined once in T1 and consumed by T2 (409) and T4 (disabled button).

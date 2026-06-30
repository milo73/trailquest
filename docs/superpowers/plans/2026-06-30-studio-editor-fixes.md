# Studio Editor Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Route/Stop editor bugs and add the missing affordances: persist the active stop (save/regenerate survive reload), inline route rename, clickable logo, working add-stop chooser (catalog + custom factless stop), stop pagination, return-to-route, and loading/error feedback.

**Architecture:** Mostly frontend. One new backend endpoint `POST /drafts/{id}/stops` (`draft_service.add_custom_stop`) builds a factless draft stop from name+coords. Frontend: persist `activeStopOrder`, a shared `saving` flag, `renameDraft`/`addCustomStop` store actions, a clickable logo, PoiPicker loading/error states, a RouteEditor add-stop chooser + custom form + inline rename, and StopEditor mount-load + pagination + return link + Regenereer error.

**Tech Stack:** Python/FastAPI/Pydantic/pytest (backend); Vite + React + TypeScript + Vitest + RTL (frontend).

## Source-of-truth convention

Backend task gives full Python. Frontend logic tasks (types, client, store, StudioChrome, PoiPicker, CustomStopForm) give full TypeScript. The two screen rewires (RouteEditor, StopEditor) modify existing files — the plan cites the file and the exact edits, and gives **full test code**. Read the current file before editing.

Backend runs from `backend/` after `source .venv/bin/activate`. Frontend from `frontend/` with `npm test`.

## Global Constraints

- **Frontend-first; one backend endpoint.** Offline-safe (seed POIs, no LLM needed for these paths). Backend CI green: `ruff check`, `ruff format --check`, `mypy app`, `pytest`.
- **Content accuracy:** a custom POI has `facts: []` (a deliberately non-factual stop, flagged "geen feiten"). Catalog facts stay locked/unchanged. Do not weaken the `Question` gating model.
- **`activeStopOrder` and the draft id both persist** to `localStorage` so a reload of `/studio/stop` restores the editor.
- **UI strings Dutch.** No `window.confirm`/`alert`/`prompt`.
- **Frontend:** existing player + studio suites stay green; `npm run typecheck` clean; no `act(...)` warnings.
- A pre-existing Starlette/httpx `StarletteDeprecationWarning` in pytest output is not a failure — ignore it.
- Run dirs: backend `backend/`; frontend `frontend/`.

---

### Task 1: Backend — custom-stop endpoint

**Files:**
- Modify: `backend/app/models/schemas.py` (append `CustomStopRequest`)
- Modify: `backend/app/services/draft_service.py` (`add_custom_stop` + imports)
- Modify: `backend/app/api/drafts.py` (`POST /drafts/{draft_id}/stops`)
- Test: `backend/tests/test_custom_stop.py`

**Interfaces:**
- Consumes: `DraftTrail`/`DraftStop`/`POI`/`GeoPoint`; the `drafts` store; `_measure`.
- Produces: `CustomStopRequest {name: str; lat: float|None; lon: float|None}`; `draft_service.add_custom_stop(draft_id, *, name, lat=None, lon=None) -> DraftTrail | None`; `POST /drafts/{draft_id}/stops` (201) → `DraftTrail`, 404 unknown draft.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_custom_stop.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app
from app.models.schemas import DraftCreate, GeoPoint
from app.services import draft_service

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def test_add_custom_stop_appends_factless_stop_and_defaults_coords():
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    updated = draft_service.add_custom_stop(d.id, name="Mijn plek")
    assert updated.stops[-1].poi.name == "Mijn plek"
    assert updated.stops[-1].poi.facts == []
    assert updated.stops[-1].poi.id.startswith("custom:")
    # coords default to the draft start when omitted
    assert updated.stops[-1].poi.location.lat == HAARLEM["lat"]
    assert updated.stops[-1].order == len(updated.stops)


def test_add_custom_stop_unknown_draft_returns_none():
    assert draft_service.add_custom_stop("nope", name="x") is None


def test_post_custom_stop_endpoint_roundtrip_and_404():
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    r = client.post(f"/drafts/{d.id}/stops", json={"name": "Verzonnen stop", "lat": 52.39, "lon": 4.64})
    assert r.status_code == 201
    body = r.json()
    assert body["stops"][-1]["poi"]["name"] == "Verzonnen stop"
    assert body["stops"][-1]["poi"]["location"]["lat"] == 52.39
    assert client.post("/drafts/nope/stops", json={"name": "x"}).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_custom_stop.py -q`
Expected: FAIL (ImportError / AttributeError / 404 on POST .../stops).

- [ ] **Step 3: Add the schema**

Append to `backend/app/models/schemas.py`:
```python
class CustomStopRequest(BaseModel):
    name: str
    lat: float | None = None
    lon: float | None = None
```

- [ ] **Step 4: Add the service function**

In `backend/app/services/draft_service.py`, add `POI` and `GeoPoint` to the `from app.models.schemas import (...)` block, ensure `import uuid` is present (it is), and add:
```python
def add_custom_stop(
    draft_id: str, *, name: str, lat: float | None = None, lon: float | None = None
) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    poi = POI(
        id=f"custom:{uuid.uuid4()}",
        name=name,
        location=GeoPoint(
            lat=lat if lat is not None else draft.start.lat,
            lon=lon if lon is not None else draft.start.lon,
        ),
        facts=[],
    )
    draft.stops.append(DraftStop(order=len(draft.stops) + 1, poi=poi))
    _measure(draft)
    drafts.put(draft)
    return draft
```

- [ ] **Step 5: Add the route**

In `backend/app/api/drafts.py`, add `CustomStopRequest` to the schema import and add:
```python
@router.post("/{draft_id}/stops", response_model=DraftTrail, status_code=201)
def create_custom_stop(draft_id: str, req: CustomStopRequest) -> DraftTrail:
    draft = draft_service.add_custom_stop(draft_id, name=req.name, lat=req.lat, lon=req.lon)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft
```

- [ ] **Step 6: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. If `ruff format --check .` flags files, run `ruff format .` and include it.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/schemas.py backend/app/services/draft_service.py backend/app/api/drafts.py backend/tests/test_custom_stop.py
git commit -m "feat(backend): POST /drafts/{id}/stops to add a custom factless stop"
```

---

### Task 2: Frontend API — `createCustomStop`

**Files:**
- Modify: `frontend/src/api/types.ts` (add `CustomStopRequest`)
- Modify: `frontend/src/api/drafts.ts` (add `createCustomStop`)
- Test: `frontend/src/api/drafts.test.ts` (add a case)

**Interfaces:**
- Produces: `CustomStopRequest {name: string; lat?: number; lon?: number}`; `createCustomStop(draftId, body) -> Promise<DraftTrail>` (POST `/drafts/{id}/stops`).

- [ ] **Step 1: Add the type**

Append to `frontend/src/api/types.ts`:
```ts
export interface CustomStopRequest {
  name: string;
  lat?: number;
  lon?: number;
}
```

- [ ] **Step 2: Add the client**

In `frontend/src/api/drafts.ts`, add `CustomStopRequest` to the `import type { … } from "./types"` block and add:
```ts
export const createCustomStop = (draftId: string, body: CustomStopRequest) =>
  apiFetch<DraftTrail>(`/drafts/${draftId}/stops`, { method: "POST", body: JSON.stringify(body) });
```

- [ ] **Step 3: Add the failing test**

Append to `frontend/src/api/drafts.test.ts` (add `createCustomStop` to the existing import from `./drafts`):
```ts
test("createCustomStop POSTs name + coords to the draft stops path", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d1" }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  await createCustomStop("d1", { name: "Mijn plek", lat: 52.39, lon: 4.64 });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1/stops");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ name: "Mijn plek", lat: 52.39, lon: 4.64 });
});
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- drafts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): createCustomStop API client + type"
```

---

### Task 3: Draft store — persist active stop, `saving`, `renameDraft`, `addCustomStop`

**Files:**
- Modify: `frontend/src/studio/draftStore.tsx`
- Test: `frontend/src/studio/draftStore.test.tsx` (add cases)

**Interfaces:**
- Consumes: `updateDraft`, `createCustomStop` (`api/drafts`), `CustomStopRequest` (`api/types`).
- Produces (added to `useDraft()`):
  - `saving: boolean`
  - `renameDraft(title: string): Promise<void>` → `updateDraft(draft.id, { title })`, replace draft.
  - `addCustomStop(body: { name: string; lat?: number; lon?: number }): Promise<void>` → `createCustomStop`, replace draft.
  - `activeStopOrder` persists to `localStorage["tq.studio.activeStop"]` in `setActiveStop` and restores on init.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/draftStore.test.tsx`:
```tsx
test("setActiveStop persists, and a fresh provider restores activeStopOrder", () => {
  localStorage.clear();
  const first = renderHook(() => useDraft(), { wrapper });
  act(() => first.result.current.setActiveStop(3));
  expect(localStorage.getItem("tq.studio.activeStop")).toBe("3");
  const second = renderHook(() => useDraft(), { wrapper });
  expect(second.result.current.activeStopOrder).toBe(3);
});

test("renameDraft PUTs the title and replaces the draft; saving toggles", async () => {
  const renamed = { ...draft([]), title: "Hernoemd" };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson(renamed)); // updateDraft(title)
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.renameDraft("Hernoemd"); });
  expect(result.current.draft?.title).toBe("Hernoemd");
  expect(result.current.saving).toBe(false);
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1");
  expect(JSON.parse(putCall[1].body)).toEqual({ title: "Hernoemd" });
});

test("addCustomStop POSTs to /stops and replaces the draft", async () => {
  const withStop = draft([{ order: 1, poi: poi("custom:x", "Mijn plek") }]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson(withStop, 201)); // createCustomStop
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.addCustomStop({ name: "Mijn plek" }); });
  expect(result.current.draft?.stops[0].poi.name).toBe("Mijn plek");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/drafts/d1/stops");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- draftStore`
Expected: FAIL (`renameDraft` not a function; activeStop not restored).

- [ ] **Step 3: Implement the store changes**

Edit `frontend/src/studio/draftStore.tsx`:

1. Import additions (line 2-3): add `createCustomStop` to the `../api/drafts` import; add `CustomStopRequest` to the `../api/types` import.
2. Add a second storage key after line 5:
```ts
const ACTIVE_KEY = "tq.studio.activeStop";
```
3. Add `saving`, `renameDraft`, `addCustomStop` to the `DraftApi` interface:
```ts
  saving: boolean;
  renameDraft: (title: string) => Promise<void>;
  addCustomStop: (body: CustomStopRequest) => Promise<void>;
```
4. Initialize `activeStopOrder` from storage and add `saving` state (replace the two `useState` lines at 27-28):
```ts
  const [draft, setDraft] = useState<DraftTrail | undefined>(undefined);
  const [activeStopOrder, setActiveStopOrder] = useState<number | undefined>(() => {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v != null ? Number(v) : undefined;
  });
  const [saving, setSaving] = useState(false);
```
5. Inside the `useMemo`, wrap the network mutations with `saving`. Change the `save` helper and the actions so each network call sets `saving` true/false in `finally`. Concretely:
```ts
    async function save(next: DraftTrail) {
      setDraft(next); // optimistic
      setSaving(true);
      try {
        const saved = await updateDraft(next.id, { stop_poi_ids: next.stops.map((s) => s.poi.id) });
        setDraft(saved);
      } finally {
        setSaving(false);
      }
    }
```
   Add to the returned object: `saving`, and:
```ts
      setActiveStop: (order) => {
        setActiveStopOrder(order);
        localStorage.setItem(ACTIVE_KEY, String(order));
      },
      renameDraft: async (title) => {
        if (!draft) return;
        setSaving(true);
        try {
          const saved = await updateDraft(draft.id, { title });
          setDraft(saved);
        } finally {
          setSaving(false);
        }
      },
      addCustomStop: async (body) => {
        if (!draft) return;
        setSaving(true);
        try {
          const saved = await createCustomStop(draft.id, body);
          setDraft(saved);
        } finally {
          setSaving(false);
        }
      },
```
   Also wrap `saveStopContent` in the same `setSaving(true)/finally setSaving(false)` pattern.
6. Add `saving` to the `useMemo` dependency array: `}, [draft, activeStopOrder, saving]);`.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- draftStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/draftStore.tsx frontend/src/studio/draftStore.test.tsx
git commit -m "feat(frontend): persist activeStop, saving flag, renameDraft + addCustomStop"
```

---

### Task 4: StudioChrome — clickable logo

**Files:**
- Modify: `frontend/src/studio/StudioChrome.tsx`
- Test: `frontend/src/studio/StudioChrome.test.tsx` (new)

**Interfaces:**
- Produces: the "TrailQuest" wordmark navigates to `/studio` on click.

- [ ] **Step 1: Write the failing test**

`frontend/src/studio/StudioChrome.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

import { StudioChrome } from "./StudioChrome";

test("clicking the TrailQuest logo navigates to /studio", async () => {
  render(<StudioChrome><div>content</div></StudioChrome>);
  await userEvent.click(screen.getByRole("button", { name: /TrailQuest/i }));
  expect(navigate).toHaveBeenCalledWith("/studio");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- StudioChrome`
Expected: FAIL (no button named TrailQuest).

- [ ] **Step 3: Make the wordmark a button**

In `frontend/src/studio/StudioChrome.tsx`, replace the wordmark `<span>` (`<span style={{ font: "400 22px/1 var(--tq-serif)", color: "#b5453a" }}>TrailQuest</span>`) with:
```tsx
<button
  onClick={() => navigate("/studio")}
  aria-label="TrailQuest — naar mijn tochten"
  style={{
    font: "400 22px/1 var(--tq-serif)",
    color: "#b5453a",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  }}
>
  TrailQuest
</button>
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- StudioChrome`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/StudioChrome.tsx frontend/src/studio/StudioChrome.test.tsx
git commit -m "feat(frontend): clickable TrailQuest logo -> /studio"
```

---

### Task 5: PoiPicker — loading / empty / error states

**Files:**
- Modify: `frontend/src/studio/components/PoiPicker.tsx`
- Modify: `frontend/src/studio/components/PoiPicker.test.tsx` (add a case)

**Interfaces:**
- Produces: PoiPicker shows "POI's laden…" before the fetch settles, "Geen POI's gevonden" when empty, "Kon POI's niet laden" on error.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/components/PoiPicker.test.tsx`:
```tsx
test("shows a loading state before the POI fetch resolves", async () => {
  // a fetch that never resolves within the test → loading text stays
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<PoiPicker start={{ lat: 52.38, lon: 4.63 }} excludeIds={[]} onPick={() => {}} onClose={() => {}} />);
  expect(screen.getByText(/laden/i)).toBeInTheDocument();
});

test("shows an error message when the POI fetch fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
  render(<PoiPicker start={{ lat: 52.38, lon: 4.63 }} excludeIds={[]} onPick={() => {}} onClose={() => {}} />);
  expect(await screen.findByText(/Kon POI's niet laden/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- PoiPicker`
Expected: FAIL (no loading/error text).

- [ ] **Step 3: Add loading + error state**

In `frontend/src/studio/components/PoiPicker.tsx`:
- Add state: `const [loading, setLoading] = useState(true);` and `const [error, setError] = useState(false);`
- In the `useEffect`, set `loading` false when the promise settles and `error` true on catch:
```tsx
  useEffect(() => {
    setLoading(true);
    getPois({ lat: start.lat, lon: start.lon, distance_km: 5 })
      .then((pois) => {
        const filtered = pois.filter((p) => !excludeIds.includes(p.id));
        setCandidates(filtered);
        if (filtered.length === 0) setEmpty(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [start.lat, start.lon]); // eslint-disable-line react-hooks/exhaustive-deps
```
- In the list body, render in priority order: `loading` → "POI's laden…"; `error` → "Kon POI's niet laden"; `empty` → existing "Geen POI's gevonden"; else the list. Reuse the existing centered `<p>` style for the loading/error messages.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- PoiPicker`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/components/PoiPicker.tsx frontend/src/studio/components/PoiPicker.test.tsx
git commit -m "feat(frontend): PoiPicker loading + error states"
```

---

### Task 6: RouteEditor — add-stop chooser, custom form, inline rename

**Files:**
- Create: `frontend/src/studio/components/CustomStopForm.tsx`
- Modify: `frontend/src/studio/screens/RouteEditor.tsx`
- Modify: `frontend/src/studio/screens/RouteEditor.test.tsx` (add cases)

**Interfaces:**
- Consumes: `useDraft()` (`addCustomStop`, `renameDraft`, `addStop`, `saving`, `draft`), `PoiPicker`.
- Produces: `CustomStopForm({ start, onSubmit, onClose })` modal; RouteEditor add-stop chooser + editable title.

Read the current `frontend/src/studio/screens/RouteEditor.tsx` first.

**CustomStopForm.tsx** — a modal (same overlay pattern as `PoiPicker`: fixed backdrop `onClick=onClose` + centered panel `role="dialog" aria-label="Nieuwe stop"`). Fields: a required `<input aria-label="Naam">`, optional `<input aria-label="Latitude">` / `<input aria-label="Longitude">` (placeholders showing `start.lat`/`start.lon`), and a "Toevoegen" submit button (disabled when name is empty). On submit call `onSubmit({ name, lat?: number, lon?: number })` (parse the coord strings with `parseFloat`; omit when blank/NaN) then nothing else (the parent closes). Signature:
```tsx
export function CustomStopForm({
  start, onSubmit, onClose,
}: {
  start: { lat: number; lon: number };
  onSubmit: (body: { name: string; lat?: number; lon?: number }) => void;
  onClose: () => void;
}) { /* ... */ }
```

**RouteEditor edits:**
- Pull `addCustomStop`, `renameDraft`, `saving` from `useDraft()` (alongside the existing destructure).
- Replace the single `pickerOpen` boolean with an `addMode` state: `const [addMode, setAddMode] = useState<null | "menu" | "catalog" | "custom">(null);`. The "+ Stop toevoegen" button sets `addMode("menu")`. When `addMode === "menu"`, render two buttons — "Kies uit de buurt" → `setAddMode("catalog")` and "Maak een nieuwe stop" → `setAddMode("custom")` (a small inline menu near the add button is fine; keep it simple). When `addMode === "catalog"`, render the existing `<PoiPicker … onPick={(poi) => { addStop(poi); setAddMode(null); }} onClose={() => setAddMode(null)} />`. When `addMode === "custom"`, render `<CustomStopForm start={draft.start} onSubmit={(body) => { addCustomStop(body); setAddMode(null); }} onClose={() => setAddMode(null)} />`.
- **Inline rename:** replace the title display (`{draft.title}` at line ~158) with a controlled `<input aria-label="Tochtnaam">` seeded from `draft.title` (local state, re-seeded via `useEffect` on `draft.id`), `onBlur={() => { if (title.trim() && title !== draft.title) renameDraft(title); }}`. Next to it render a small status: `saving ? "Bezig…" : "Opgeslagen ✓"` (mono, muted).
- Keep all other RouteEditor behavior (busy/disable, generate concept, etc.).

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/studio/screens/RouteEditor.test.tsx` (reuse the file's existing harness/imports; add `within`, `vi`, `fireEvent` if missing):
```tsx
test("the add-stop chooser opens the custom form and addCustomStop is called", async () => {
  const seeded = draft([]); // helper from the file
  const fetchMock = vi.fn((url: string) => {
    if (url === "/api/drafts/d1/stops")
      return Promise.resolve(new Response(JSON.stringify(draft([{ order: 1, poi: poi("custom:x", "Mijn plek") }])), { status: 201 }));
    return Promise.resolve(new Response(JSON.stringify(seeded), { status: 201 })); // createDraft
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Stop toevoegen/i }));
  await userEvent.click(screen.getByRole("button", { name: /Maak een nieuwe stop/i }));
  const dialog = await screen.findByRole("dialog", { name: /Nieuwe stop/i });
  await userEvent.type(within(dialog).getByLabelText("Naam"), "Mijn plek");
  await userEvent.click(within(dialog).getByRole("button", { name: /Toevoegen/i }));
  await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === "/api/drafts/d1/stops")).toBe(true));
});

test("editing the route title and blurring renames the draft", async () => {
  const seeded = draft([]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(seeded), { status: 201 })) // createDraft
    .mockResolvedValue(new Response(JSON.stringify({ ...seeded, title: "Mijn route" }), { status: 200 })); // updateDraft
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><DraftProvider><Harness seed={seeded} /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  const title = await screen.findByLabelText("Tochtnaam");
  await userEvent.clear(title);
  await userEvent.type(title, "Mijn route");
  fireEvent.blur(title);
  await waitFor(() => {
    const put = fetchMock.mock.calls.find((c) => c[0] === "/api/drafts/d1" && c[1]?.method === "PUT");
    expect(put).toBeTruthy();
    expect(JSON.parse(put![1].body)).toEqual({ title: "Mijn route" });
  });
});
```
> If the existing `RouteEditor.test.tsx` `draft()` helper sets `id` to something other than `"d1"`, align the asserted URLs (`/api/drafts/<id>...`) to that id.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- RouteEditor`
Expected: FAIL (no custom form / no editable title).

- [ ] **Step 3: Implement** `CustomStopForm.tsx` and the RouteEditor edits per the Interfaces notes.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- RouteEditor`
Expected: PASS (existing + new). No `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/components/CustomStopForm.tsx frontend/src/studio/screens/RouteEditor.tsx frontend/src/studio/screens/RouteEditor.test.tsx
git commit -m "feat(frontend): RouteEditor add-stop chooser (catalog + custom) + inline rename"
```

---

### Task 7: StopEditor — mount-load, pagination, return link, feedback

**Files:**
- Modify: `frontend/src/studio/screens/StopEditor.tsx`
- Modify: `frontend/src/studio/screens/StopEditor.test.tsx` (add cases)

**Interfaces:**
- Consumes: `useDraft()` (`draft`, `activeStopOrder`, `setActiveStop`, `loadDraft`, `saving`, `generateStopContent`), `useNavigate`.
- Produces: StopEditor restores on reload, paginates stops, returns to route, and surfaces a Regenereer error + save status.

Read the current `frontend/src/studio/screens/StopEditor.tsx` first. Edits:

1. **Mount load.** Pull `loadDraft` from `useDraft()` and add (mirroring RouteEditor):
```tsx
useEffect(() => {
  if (!draft) {
    const savedId = localStorage.getItem("tq.studio.draft");
    if (savedId) loadDraft(savedId);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```
2. **Pagination.** Replace the sidebar prev/next buttons + the `STOP {stop.order} / 7` label with real navigation. Compute:
```tsx
const orders = draft?.stops.map((s) => s.order) ?? [];
const idx = activeStopOrder !== undefined ? orders.indexOf(activeStopOrder) : -1;
```
Wire "Vorige stop" `onClick={() => idx > 0 && setActiveStop(orders[idx - 1])}` `disabled={idx <= 0}`; "Volgende stop" `onClick={() => idx >= 0 && idx < orders.length - 1 && setActiveStop(orders[idx + 1])}` `disabled={idx < 0 || idx >= orders.length - 1}`; label `STOP {idx >= 0 ? idx + 1 : "—"} / {orders.length || "—"}`.
3. **Return to route.** Add `const navigate = useNavigate();` (import from `react-router-dom`) and a "← Terug naar route" button at the top of the left sidebar → `onClick={() => navigate("/studio/route")}`.
4. **Regenereer error.** Add `const [regenError, setRegenError] = useState(false);`. Wrap the body of `handleRegenerate` so it `setRegenError(false)` at the start and `catch { setRegenError(true); }` around the `await generateStopContent(...)` (keep the existing `finally setRegenerating(false)`). Render an inline Dutch message "Genereren mislukt — probeer opnieuw" near the Regenereer button when `regenError`.
5. **Save status.** Pull `saving` from `useDraft()`; render a small "Bezig… / Opgeslagen ✓" indicator in the editor header area (e.g. next to the Verhaal "AI-gegenereerd" tag).
6. **No active stop hint.** When `draft` exists but `activeStopOrder` is undefined or not found in `orders`, render "Geen stop geselecteerd — kies een stop in de route-editor" in the editor body instead of editing the MOCK_STOP fallback. (Keep the MOCK_STOP fallback only for the no-draft case so existing unit tests stay green.)

Do NOT change `canGate`, `countWords`, the locked Feiten zone, or the save/generate logic from the authoring feature.

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/studio/screens/StopEditor.test.tsx` (reuse existing imports; ensure `fireEvent`, `waitFor`, `vi`, `MemoryRouter`, `DraftProvider`, `useDraft` are imported):
```tsx
test("prev/next pagination changes the active stop", async () => {
  const draftWithStops = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [
      { order: 1, poi: { id: "p1", name: "Eerste", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: null },
      { order: 2, poi: { id: "p2", name: "Tweede", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: null },
    ],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStops), { status: 201 })));
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  expect(await screen.findByText("Eerste")).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("Volgende stop"));
  expect(await screen.findByText("Tweede")).toBeInTheDocument();
});

test("a failed Regenereer shows an error message", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p1", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: null }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi.fn((url: string) =>
    String(url).endsWith("/generate")
      ? Promise.resolve(new Response("boom", { status: 500 }))
      : Promise.resolve(new Response(JSON.stringify(draftWithStop), { status: 201 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Regenereer|Genereren/i }));
  expect(await screen.findByText(/Genereren mislukt/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- StopEditor`
Expected: FAIL (pagination not wired; no error message).

- [ ] **Step 3: Implement** the edits per the notes above.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- StopEditor`
Expected: PASS (existing authoring tests + new). No `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "feat(frontend): StopEditor mount-load + pagination + return link + Regenereer error"
```

---

### Task 8: Full verification + README

**Files:**
- Modify: `frontend/README.md`, `backend/README.md`

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all tests pass (no `act(...)` warnings beyond pre-existing Router future-flag stderr), typecheck clean, build succeeds. Report the test count.

- [ ] **Step 3: Update READMEs**

`backend/README.md`: add `POST /drafts/{id}/stops` (add a custom factless stop; body `name`, optional `lat`/`lon` defaulting to the draft start) to the endpoint table. `frontend/README.md`: note the studio editor improvements — route rename, clickable logo, add-stop chooser (catalog + custom stop), stop pagination, return-to-route, and that the active stop now survives reload. Add a manual smoke line (do NOT claim an interactive run): open a draft → rename it → add a stop from the catalog and a custom one → open a stop → page through stops with the arrows → "Terug naar route" → reload `/studio/stop` and confirm the editor restores.

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md backend/README.md
git commit -m "docs: studio editor fixes — custom-stop endpoint + run notes"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §4.1 schema + §4.2 service + §4.3 route → T1; §5.2 api → T2; §5.1 store (persist activeStop, saving, renameDraft, addCustomStop) → T3; §5.3 logo → T4; §5.4 PoiPicker → T5; §5.5 RouteEditor (chooser + custom form + rename) → T6; §2 + §5.6 StopEditor (mount-load, pagination, return, feedback) → T7; §7 testing → tests in every task; §8 out-of-scope respected (no map tiles, no validation screen, no deeper factless gating, no client timeout).
- **Placeholder scan:** screen tasks (T6, T7) cite the existing files + give exact edits and full test code; backend/logic tasks give full code.
- **Type consistency:** `CustomStopRequest` fields match backend (T1) and frontend (T2); `add_custom_stop`/`create_custom_stop` (T1) ↔ `createCustomStop` (T2) ↔ `addCustomStop` store action (T3); `renameDraft`/`saving`/`activeStopOrder` names consistent across T3/T6/T7; the `tq.studio.activeStop` key matches between T3 (write) and T7 (the store restores it); `setActiveStop`/`loadDraft`/`generateStopContent` consumed in T6/T7 exactly as the store defines them.

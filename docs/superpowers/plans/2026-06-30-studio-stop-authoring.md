# Studio Stop-Editor Content Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the studio Stop editor fully working — edit + persist a stop's story and question to the draft, and regenerate a grounded story (+ candidate question) from only the selected facts.

**Architecture:** Backend adds a `tone` param to `LLMProvider.rephrase`, a no-cache `content_service.author_content`, two `draft_service` content functions, and two draft-scoped routers (`PUT /drafts/{id}/stops/{order}`, `POST /drafts/{id}/stops/{order}/generate`) with a `ValueError→422` handler so the `Question` model's gating invariant surfaces cleanly. Frontend adds two API clients, two draft-store actions, and rewires the StopEditor to load/edit/persist content (blur-autosave) with real fact-scoped Regenereer + a tone selector.

**Tech Stack:** Python 3 / FastAPI / Pydantic / pytest (backend); Vite + React + TypeScript + Vitest + React Testing Library (frontend).

## Source-of-truth convention

Backend tasks give full Python. Frontend logic tasks (types, clients, store) give full TypeScript. The StopEditor rewire tasks (T7, T8) modify the existing `frontend/src/studio/screens/StopEditor.tsx` — the plan cites the file and specifies exact data-layer swaps and gives **full test code**. Read the current file before editing.

Backend runs from `backend/` after `source .venv/bin/activate`. Frontend runs from `frontend/` with `npm test`.

## Global Constraints

- **Offline by default.** Generation works with no network/keys via the stub provider; tests run offline. Do not require a real LLM.
- **Content-accuracy contract.** Facts stay locked (display + include/exclude only; never free-text editable). Generated story is produced server-side from ONLY the selected facts. A gating question (Type A/D) must carry an answer; Type B can never gate — the `Question` model enforces this and the UI mirrors it.
- **No-cache authoring.** `author_content` must NOT read or write `content_cache` (authoring wants fresh, fact-filtered output).
- **Degrade rather than break (PRD §13):** generation falls back to the stub on `RuntimeError`; unknown draft/stop → 404.
- **Save model:** text fields (story, prompt, answer, hint) autosave **on blur**; type/gate changes and a successful Regenereer save **immediately**.
- **UI strings in Dutch.** No `window.confirm`/`alert`/`prompt`.
- **Backend CI green:** `ruff check`, `ruff format --check`, `mypy app`, `pytest` all pass.
- **Frontend:** existing player + studio suites stay green; `npm run typecheck` clean; no `act(...)` warnings.
- A pre-existing Starlette/httpx `StarletteDeprecationWarning` in pytest output is not a failure — ignore it.

---

### Task 1: `tone` on `LLMProvider.rephrase`

**Files:**
- Modify: `backend/app/services/llm/provider.py`
- Test: `backend/tests/test_rephrase_tone.py`

**Interfaces:**
- Produces: `LLMProvider.rephrase(..., tone: str | None = None)` and `StubProvider.rephrase(..., tone: str | None = None)`; `_build_prompt(..., tone: str | None = None)`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_rephrase_tone.py`:
```python
from app.models.schemas import Fact, Source, SourceLicense, Theme
from app.services.llm.provider import StubProvider


def _fact() -> Fact:
    return Fact(key="height_m", value="78", source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"))


def test_stub_rephrase_accepts_tone_and_stays_grounded():
    # tone is accepted (no TypeError) and the stub still echoes only the facts
    story = StubProvider().rephrase(poi_name="Toren", theme=Theme.HISTORICAL, facts=[_fact()], tone="speels")
    assert "78" in story
    assert "Toren" in story
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_rephrase_tone.py -q`
Expected: FAIL (TypeError: unexpected keyword argument 'tone').

- [ ] **Step 3: Add `tone` through the rephrase path**

In `backend/app/services/llm/provider.py`:

Change `_build_prompt` signature + append a tone line:
```python
def _build_prompt(
    poi_name: str, theme: Theme, facts: list[Fact], background: str | None, tone: str | None = None
) -> str:
    fact_lines = "\n".join(f"- {f.key.replace('_', ' ')}: {f.value}" for f in facts)
    prompt = (
        f"Place: {poi_name}\n"
        f"Theme: {theme.value}\n"
        f"Verified facts (use only these for verifiable claims):\n{fact_lines}\n"
    )
    if background:
        prompt += (
            f"\nBackground to paraphrase (do not copy, do not extract new facts):\n{background}\n"
        )
    if tone:
        prompt += f"\nTone: write in a {tone} tone.\n"
    return prompt + "\nWrite the stop description now."
```

Change `LLMProvider.rephrase`:
```python
    def rephrase(
        self,
        *,
        poi_name: str,
        theme: Theme,
        facts: list[Fact],
        background: str | None = None,
        tone: str | None = None,
    ) -> str:
        if not facts and not background:
            return f"{poi_name} is part of your trail."
        prompt = _build_prompt(poi_name, theme, facts, background, tone)
        return self.complete(system=_SYSTEM_PROMPT, prompt=prompt).strip()
```

Change `StubProvider.rephrase` (tone accepted, ignored):
```python
    def rephrase(
        self,
        *,
        poi_name: str,
        theme: Theme,
        facts: list[Fact],
        background: str | None = None,
        tone: str | None = None,
    ) -> str:
        if not facts:
            return f"{poi_name} is part of your trail."
        rendered = "; ".join(f"{f.key.replace('_', ' ')}: {f.value}" for f in facts)
        return f"{poi_name} — {rendered}."
```

- [ ] **Step 4: Run test + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_rephrase_tone.py -q && ruff check app && mypy app`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/llm/provider.py backend/tests/test_rephrase_tone.py
git commit -m "feat(backend): add optional tone to LLMProvider.rephrase"
```

---

### Task 2: `content_service.author_content`

**Files:**
- Modify: `backend/app/services/content_service.py` (add function)
- Test: `backend/tests/test_author_content.py`

**Interfaces:**
- Consumes: `_build_question`, `get_llm_provider`, `StubProvider`, `rephrase(..., tone=...)` (Task 1).
- Produces: `author_content(poi: POI, theme: Theme, tone: str | None = None) -> tuple[str, Question]`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_author_content.py`:
```python
from app.cache.store import content_cache
from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense, Theme
from app.services import content_service


def _poi() -> POI:
    return POI(
        id="p1",
        name="Sint-Bavokerk",
        location=GeoPoint(lat=52.38, lon=4.63),
        facts=[Fact(key="height_m", value="78", source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"))],
    )


def test_author_content_grounds_in_facts_and_builds_question():
    content_cache.clear()
    story, question = content_service.author_content(_poi(), Theme.HISTORICAL, tone="speels")
    assert "78" in story  # grounded in the supplied fact (stub echoes facts offline)
    assert question.type == "A"  # height_m is a data-bound template
    assert question.answer == "78"


def test_author_content_does_not_touch_the_cache():
    content_cache.clear()
    content_service.author_content(_poi(), Theme.HISTORICAL)
    assert content_cache.get("p1", Theme.HISTORICAL) is None  # no cache write
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_author_content.py -q`
Expected: FAIL (AttributeError: module has no attribute 'author_content').

- [ ] **Step 3: Add the function**

In `backend/app/services/content_service.py`, add after `build_stop`:
```python
def author_content(poi: POI, theme: Theme, tone: str | None = None) -> tuple[str, Question]:
    """Generate authoring content (story + candidate question) for one POI.

    Unlike :func:`build_stop` this never reads or writes the (POI × theme) cache —
    the studio author wants fresh output scoped to the facts they selected (the
    caller passes a POI carrying only those facts). Degrades to the stub on any
    provider failure (PRD §13).
    """
    question = _build_question(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    except RuntimeError:
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    return story, question
```

- [ ] **Step 4: Run test + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_author_content.py -q && ruff check app && mypy app`
Expected: PASS (2 passed); clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/content_service.py backend/tests/test_author_content.py
git commit -m "feat(backend): content_service.author_content (no-cache authoring generation)"
```

---

### Task 3: Stop-content schemas + `draft_service` functions

**Files:**
- Modify: `backend/app/models/schemas.py` (append request/result models)
- Modify: `backend/app/services/draft_service.py` (add two functions)
- Test: `backend/tests/test_draft_stop_content.py`

**Interfaces:**
- Consumes: `author_content` (Task 2); existing `DraftTrail`/`DraftStop`/`Question`/`POI`; `drafts` store; `_attributions`.
- Produces:
  - schemas `StopContentUpdate {story?: str|None; question?: Question|None}`, `StopGenerateRequest {fact_keys?: list[str]|None; tone?: str|None}`, `StopGenerateResult {story: str; question: Question}`.
  - `draft_service.set_stop_content(draft_id, order, *, story=None, question=None) -> DraftTrail | None`
  - `draft_service.generate_stop_content(draft_id, order, *, fact_keys=None, tone=None) -> tuple[str, Question] | None`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_draft_stop_content.py`:
```python
import pytest

from app.cache.store import drafts
from app.models.schemas import DraftCreate, GeoPoint, Question, QuestionType
from app.services import draft_service, poi_service

HAARLEM = GeoPoint(lat=52.3812, lon=4.6361)


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def _draft_with_one_stop():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    poi_id = poi_service.candidates(HAARLEM, 5)[0].id
    draft_service.update(d.id, __import__("app.models.schemas", fromlist=["DraftUpdate"]).DraftUpdate(stop_poi_ids=[poi_id]))
    return draft_service.get(d.id)


def test_set_stop_content_persists_story_and_question():
    d = _draft_with_one_stop()
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="Wat denk je?")
    updated = draft_service.set_stop_content(d.id, 1, story="Een mooi verhaal.", question=q)
    assert updated.stops[0].story == "Een mooi verhaal."
    assert updated.stops[0].question.prompt == "Wat denk je?"
    # persisted
    assert draft_service.get(d.id).stops[0].story == "Een mooi verhaal."


def test_set_stop_content_unknown_draft_or_stop_returns_none():
    assert draft_service.set_stop_content("nope", 1, story="x") is None
    d = _draft_with_one_stop()
    assert draft_service.set_stop_content(d.id, 99, story="x") is None


def test_generate_stop_content_filters_by_fact_keys():
    d = _draft_with_one_stop()
    stop_poi = draft_service.get(d.id).stops[0].poi
    # generate with an empty fact selection → story must not contain any fact value
    story, question = draft_service.generate_stop_content(d.id, 1, fact_keys=[])
    for fact in stop_poi.facts:
        assert fact.value not in story
    # generate with all facts → at least one fact value appears (stub echoes facts)
    story_all, _ = draft_service.generate_stop_content(d.id, 1, fact_keys=None)
    assert any(f.value in story_all for f in stop_poi.facts)


def test_generate_unknown_returns_none():
    assert draft_service.generate_stop_content("nope", 1) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_draft_stop_content.py -q`
Expected: FAIL (ImportError / AttributeError on the new schemas/functions).

- [ ] **Step 3: Add the schemas**

Append to `backend/app/models/schemas.py`:
```python
class StopContentUpdate(BaseModel):
    story: str | None = None
    question: Question | None = None


class StopGenerateRequest(BaseModel):
    fact_keys: list[str] | None = None
    tone: str | None = None


class StopGenerateResult(BaseModel):
    story: str
    question: Question
```

- [ ] **Step 4: Add the service functions**

In `backend/app/services/draft_service.py`: extend the schema import to include `POI` and `Question`, then add:
```python
def set_stop_content(
    draft_id: str, order: int, *, story: str | None = None, question: "Question | None" = None
) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    stop = next((s for s in draft.stops if s.order == order), None)
    if stop is None:
        return None
    if story is not None:
        stop.story = story
    if question is not None:
        stop.question = question
    draft.attributions = _attributions(draft.stops)
    drafts.put(draft)
    return draft


def generate_stop_content(
    draft_id: str, order: int, *, fact_keys: list[str] | None = None, tone: str | None = None
) -> "tuple[str, Question] | None":
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    stop = next((s for s in draft.stops if s.order == order), None)
    if stop is None:
        return None
    if fact_keys is None:
        poi = stop.poi
    else:
        selected = [f for f in stop.poi.facts if f.key in set(fact_keys)]
        poi = stop.poi.model_copy(update={"facts": selected})
    return content_service.author_content(poi, draft.theme, tone)
```
Update the `from app.models.schemas import (...)` block at the top of `draft_service.py` to add `POI` and `Question` (alphabetical with the existing names).

- [ ] **Step 5: Run test + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_draft_stop_content.py -q && ruff check app && mypy app`
Expected: PASS (4 passed); clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/schemas.py backend/app/services/draft_service.py backend/tests/test_draft_stop_content.py
git commit -m "feat(backend): draft_service set/generate stop content + schemas"
```

---

### Task 4: Stop-content routers + `ValueError→422`

**Files:**
- Modify: `backend/app/api/drafts.py` (two routes)
- Modify: `backend/app/main.py` (ValueError exception handler)
- Test: `backend/tests/test_stop_content_api.py`

**Interfaces:**
- Consumes: `draft_service.set_stop_content`/`generate_stop_content` (Task 3); schemas (Task 3).
- Produces: `PUT /drafts/{id}/stops/{order}` → `DraftTrail` (404 unknown, 422 invalid question); `POST /drafts/{id}/stops/{order}/generate` → `StopGenerateResult` (404 unknown).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_stop_content_api.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app
from app.services import draft_service, poi_service
from app.models.schemas import DraftCreate, DraftUpdate, GeoPoint

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def _draft_with_one_stop() -> str:
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    poi_id = poi_service.candidates(GeoPoint(**HAARLEM), 5)[0].id
    draft_service.update(d.id, DraftUpdate(stop_poi_ids=[poi_id]))
    return d.id


def test_put_stop_content_persists_and_generate_roundtrip():
    draft_id = _draft_with_one_stop()
    gen = client.post(f"/drafts/{draft_id}/stops/1/generate", json={"tone": "speels"})
    assert gen.status_code == 200
    body = gen.json()
    assert body["story"] and body["question"]["type"]

    put = client.put(
        f"/drafts/{draft_id}/stops/1",
        json={"story": body["story"], "question": body["question"]},
    )
    assert put.status_code == 200
    assert client.get(f"/drafts/{draft_id}").json()["stops"][0]["story"] == body["story"]


def test_put_stop_content_invalid_gating_question_is_422():
    draft_id = _draft_with_one_stop()
    # Type A with no answer violates the Question gating invariant → 422
    r = client.put(
        f"/drafts/{draft_id}/stops/1",
        json={"question": {"type": "A", "prompt": "Hoe hoog?"}},
    )
    assert r.status_code == 422


def test_stop_content_unknown_is_404():
    assert client.put("/drafts/nope/stops/1", json={"story": "x"}).status_code == 404
    assert client.post("/drafts/nope/stops/1/generate", json={}).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_stop_content_api.py -q`
Expected: FAIL (404/405 on the new routes; the 422 test fails or 500s without the handler).

- [ ] **Step 3: Add the routes**

In `backend/app/api/drafts.py`, extend the schema import to add `StopContentUpdate, StopGenerateRequest, StopGenerateResult`, and add:
```python
@router.put("/{draft_id}/stops/{order}", response_model=DraftTrail)
def update_stop_content(draft_id: str, order: int, req: StopContentUpdate) -> DraftTrail:
    draft = draft_service.set_stop_content(
        draft_id, order, story=req.story, question=req.question
    )
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft or stop not found")
    return draft


@router.post("/{draft_id}/stops/{order}/generate", response_model=StopGenerateResult)
def generate_stop_content(draft_id: str, order: int, req: StopGenerateRequest) -> StopGenerateResult:
    result = draft_service.generate_stop_content(
        draft_id, order, fact_keys=req.fact_keys, tone=req.tone
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Draft or stop not found")
    story, question = result
    return StopGenerateResult(story=story, question=question)
```

- [ ] **Step 4: Add the `ValueError→422` handler**

In `backend/app/main.py`, add the imports and handler (the `Question` model raises `ValueError` for an invalid gating question; map it to 422 so the API returns a clean validation error instead of a 500):
```python
from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})
```
(Place it after `app = FastAPI(...)` and the `include_router` calls.)

- [ ] **Step 5: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. If `ruff format --check .` flags files, run `ruff format .` and include the change.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/drafts.py backend/app/main.py backend/tests/test_stop_content_api.py
git commit -m "feat(backend): stop-content routes (save + generate) with ValueError->422"
```

---

### Task 5: Frontend API types + clients

**Files:**
- Modify: `frontend/src/api/types.ts` (3 types)
- Modify: `frontend/src/api/drafts.ts` (2 clients)
- Test: `frontend/src/api/drafts.test.ts` (add cases)

**Interfaces:**
- Consumes: `apiFetch` (`api/client`), `DraftTrail`/`Question` (`api/types`).
- Produces:
  - types `StopContentUpdate`, `StopGenerateRequest`, `StopGenerateResult`.
  - `updateStopContent(draftId, order, body): Promise<DraftTrail>`
  - `generateStopContent(draftId, order, body): Promise<StopGenerateResult>`

- [ ] **Step 1: Add the types**

Append to `frontend/src/api/types.ts`:
```ts
export interface StopContentUpdate {
  story?: string | null;
  question?: Question | null;
}

export interface StopGenerateRequest {
  fact_keys?: string[];
  tone?: string;
}

export interface StopGenerateResult {
  story: string;
  question: Question;
}
```

- [ ] **Step 2: Add the clients**

Append to `frontend/src/api/drafts.ts`:
```ts
import type {
  DraftCreate,
  DraftTrail,
  DraftUpdate,
  StopContentUpdate,
  StopGenerateRequest,
  StopGenerateResult,
} from "./types";

export const updateStopContent = (draftId: string, order: number, body: StopContentUpdate) =>
  apiFetch<DraftTrail>(`/drafts/${draftId}/stops/${order}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const generateStopContent = (draftId: string, order: number, body: StopGenerateRequest) =>
  apiFetch<StopGenerateResult>(`/drafts/${draftId}/stops/${order}/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
```
(Merge the import with the existing one in `drafts.ts` rather than duplicating it.)

- [ ] **Step 3: Add the failing test**

Append to `frontend/src/api/drafts.test.ts`:
```ts
test("updateStopContent PUTs to the stop path", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await updateStopContent("d1", 2, { story: "hi" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1/stops/2");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toEqual({ story: "hi" });
});

test("generateStopContent POSTs fact_keys + tone", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ story: "s", question: { type: "C", prompt: "?", gates: false } }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const res = await generateStopContent("d1", 1, { fact_keys: ["height_m"], tone: "speels" });
  expect(res.story).toBe("s");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/drafts/d1/stops/1/generate");
  expect(JSON.parse(init.body)).toEqual({ fact_keys: ["height_m"], tone: "speels" });
});
```
Add `updateStopContent, generateStopContent` to the existing import from `./drafts` at the top of the test file.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- drafts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): stop-content API types + clients"
```

---

### Task 6: Draft store — `saveStopContent` + `generateStopContent`

**Files:**
- Modify: `frontend/src/studio/draftStore.tsx`
- Test: `frontend/src/studio/draftStore.test.tsx` (add cases)

**Interfaces:**
- Consumes: `updateStopContent`/`generateStopContent` (Task 5); `StopContentUpdate`/`StopGenerateRequest`/`StopGenerateResult` (Task 5).
- Produces (added to the `useDraft()` API):
  - `saveStopContent(order: number, content: StopContentUpdate): Promise<void>` — PUTs, replaces `draft` with the server copy.
  - `generateStopContent(order: number, body: StopGenerateRequest): Promise<StopGenerateResult>` — returns the generated content (no state change here).

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/studio/draftStore.test.tsx`:
```tsx
test("saveStopContent PUTs and replaces the draft with the server copy", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([{ order: 1, poi: poi("p1", "X") }]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson({ ...draft([{ order: 1, poi: poi("p1", "X") }]), stops: [{ order: 1, poi: poi("p1", "X"), story: "Saved." }] })); // PUT
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  await act(async () => { await result.current.saveStopContent(1, { story: "Saved." }); });
  expect(result.current.draft?.stops[0].story).toBe("Saved.");
  const putCall = fetchMock.mock.calls[1];
  expect(putCall[0]).toBe("/api/drafts/d1/stops/1");
});

test("generateStopContent returns generated content without changing the draft", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(mockJson(draft([{ order: 1, poi: poi("p1", "X") }]), 201)) // createDraft
    .mockResolvedValueOnce(mockJson({ story: "Gen.", question: { type: "C", prompt: "?", gates: false } })); // generate
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useDraft(), { wrapper });
  await act(async () => { await result.current.createDraft({ start: { lat: 52.38, lon: 4.63 } }); });
  let gen: { story: string } | undefined;
  await act(async () => { gen = await result.current.generateStopContent(1, { tone: "speels" }); });
  expect(gen?.story).toBe("Gen.");
});
```
(These reuse the existing `wrapper`, `poi`, `draft`, `mockJson` helpers in the test file. Add `saveStopContent`/`generateStopContent` usage; no new imports needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- draftStore`
Expected: FAIL (`saveStopContent` is not a function).

- [ ] **Step 3: Implement the actions**

In `frontend/src/studio/draftStore.tsx`:
- Add to the imports from `../api/drafts`: `updateStopContent, generateStopContent as apiGenerateStopContent`.
- Add to the imports from `../api/types`: `StopContentUpdate, StopGenerateRequest, StopGenerateResult`.
- Add to the `DraftApi` interface:
```ts
  saveStopContent: (order: number, content: StopContentUpdate) => Promise<void>;
  generateStopContent: (order: number, body: StopGenerateRequest) => Promise<StopGenerateResult>;
```
- Add to the returned `api` object (inside the `useMemo`):
```ts
      saveStopContent: async (order, content) => {
        if (!draft) return;
        const saved = await updateStopContent(draft.id, order, content);
        setDraft(saved);
      },
      generateStopContent: async (order, body) => {
        if (!draft) throw new Error("generateStopContent: no active draft");
        return apiGenerateStopContent(draft.id, order, body);
      },
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- draftStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/draftStore.tsx frontend/src/studio/draftStore.test.tsx
git commit -m "feat(frontend): draftStore saveStopContent + generateStopContent"
```

---

### Task 7: StopEditor — load, edit, and autosave content

**Files:**
- Modify: `frontend/src/studio/screens/StopEditor.tsx`
- Modify: `frontend/src/studio/screens/StopEditor.test.tsx` (add cases; keep existing)

**Interfaces:**
- Consumes: `useDraft()` (`saveStopContent`, `draft`, `activeStopOrder`), `Question`/`QuestionType` (`api/types`).
- Produces: a StopEditor whose Verhaal + Opdracht load from the active `DraftStop` and autosave.

Read the current `frontend/src/studio/screens/StopEditor.tsx` first. Make these changes (keep the visual layout):

1. **Source the active stop + content.** Add:
```tsx
const { draft, activeStopOrder, saveStopContent } = useDraft();
const activeStop = draft?.stops.find((s) => s.order === activeStopOrder);
const activePoi = activeStop?.poi ?? MOCK_STOP.poi;
const sourceStory = activeStop ? (activeStop.story ?? "") : MOCK_STOP.story;
const sourceQuestion = activeStop ? (activeStop.question ?? { type: "A", prompt: "", answer: "", hint: "", gates: true }) : MOCK_STOP.question;
```
2. **Local editable state**, re-seeded when the active stop changes:
```tsx
const [story, setStory] = useState(sourceStory);
const [prompt, setPrompt] = useState(sourceQuestion.prompt);
const [answer, setAnswer] = useState(sourceQuestion.answer ?? "");
const [hint, setHint] = useState(sourceQuestion.hint ?? "");
const [questionType, setQuestionType] = useState<QuestionType>(sourceQuestion.type as QuestionType);
const [gatesNext, setGatesNext] = useState<boolean>(Boolean(sourceQuestion.gates) && canGate(sourceQuestion.type as QuestionType));
const [answerError, setAnswerError] = useState(false);
useEffect(() => {
  setStory(sourceStory);
  setPrompt(sourceQuestion.prompt);
  setAnswer(sourceQuestion.answer ?? "");
  setHint(sourceQuestion.hint ?? "");
  setQuestionType(sourceQuestion.type as QuestionType);
  setGatesNext(Boolean(sourceQuestion.gates) && canGate(sourceQuestion.type as QuestionType));
}, [activeStop?.order, activePoi.id]); // eslint-disable-line react-hooks/exhaustive-deps
```
3. **Build + save the question.** Add a helper that builds the `Question` payload and saves, blocking an A/D question with no answer:
```tsx
function buildQuestion(): Question | null {
  const gating = canGate(questionType);
  if (gating && answer.trim() === "") {
    setAnswerError(true);
    return null;
  }
  setAnswerError(false);
  return {
    type: questionType,
    prompt,
    answer: gating ? answer : null,
    hint: hint || null,
    gates: gating && gatesNext,
  };
}
async function saveQuestion() {
  if (activeStopOrder === undefined) return;
  const q = buildQuestion();
  if (q === null) return; // blocked: A/D needs an answer
  await saveStopContent(activeStopOrder, { question: q });
}
async function saveStory() {
  if (activeStopOrder === undefined) return;
  await saveStopContent(activeStopOrder, { story });
}
```
4. **Wire the controls:**
   - Verhaal `<textarea>`: keep `value={story} onChange={...}`, add `onBlur={saveStory}`.
   - Replace the read-only question prompt `<p>` with an editable input bound to `prompt`, `onBlur={saveQuestion}`. Replace the read-only answer display with an `<input aria-label="Antwoord">` bound to `answer`, shown when `canGate(questionType)`, `onBlur={saveQuestion}`; when `answerError`, render an inline Dutch message "Antwoord verplicht voor een poortvraag". Add a `<input aria-label="Hint">` bound to `hint`, `onBlur={saveQuestion}`.
   - The Vraagtype `<select>` `onChange`: call the existing `handleTypeChange` then `saveQuestion()` (immediate save). The gate toggle `onChange`: set `gatesNext` then `saveQuestion()` (immediate save).
5. **Player preview** already reads `story`; change the preview's question text from `stop.question.prompt` to the local `prompt`.
6. The "Opdracht kan gaten (Type A)" sidebar status line: make it reflect the live type — `Opdracht {canGate(questionType) ? "kan gaten" : "gaten uit"} (Type {questionType})`.

Do NOT change `canGate`, `countWords`, the facts include/exclude logic, or the locked Feiten zone.

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/studio/screens/StopEditor.test.tsx` (ensure `vi`, `userEvent`, `fireEvent`, `MemoryRouter`, `DraftProvider`, `useDraft` are imported):
```tsx
test("editing the story and blurring autosaves via PUT", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "Oud verhaal.", question: { type: "C", prompt: "Wat denk je?", gates: false } }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(draftWithStop), { status: 201 }))
    .mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  const textarea = await screen.findByLabelText("Verhaal");
  await userEvent.clear(textarea);
  await userEvent.type(textarea, "Nieuw verhaal.");
  fireEvent.blur(textarea);
  await waitFor(() => {
    const putCall = fetchMock.mock.calls.find((c) => c[0] === "/api/drafts/d1/stops/1");
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall![1].body).story).toBe("Nieuw verhaal.");
  });
});

test("a Type-A question with no answer is blocked from saving", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [] }, story: "", question: { type: "A", prompt: "Hoe hoog?", answer: "10", hint: null, gates: true } }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  const answerInput = await screen.findByLabelText("Antwoord");
  await userEvent.clear(answerInput);
  fireEvent.blur(answerInput);
  expect(await screen.findByText(/Antwoord verplicht/i)).toBeInTheDocument();
  // the save was blocked: no PUT to the stop content endpoint was made
  expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/stops/1")).length).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- StopEditor`
Expected: FAIL (story not loaded from active stop; no Antwoord input / blur autosave).

- [ ] **Step 3: Implement** per the change list above.

- [ ] **Step 4: Run tests (incl. the existing StopEditor tests)**

Run: `cd frontend && npm test -- StopEditor`
Expected: PASS (existing `canGate`/word-count/gate-toggle + the 2 new). No `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "feat(frontend): StopEditor loads/edits/autosaves stop content"
```

---

### Task 8: StopEditor — real Regenereer + tone

**Files:**
- Modify: `frontend/src/studio/screens/StopEditor.tsx`
- Modify: `frontend/src/studio/screens/StopEditor.test.tsx` (add a case)

**Interfaces:**
- Consumes: `useDraft().generateStopContent` (Task 6); the `includedFacts` map + local content state (Task 7).
- Produces: a working "Regenereer" + a "Toon" tone selector.

Changes:
1. Add tone state + a select. After the imports/state, add `const [tone, setTone] = useState("speels");` and a `TONES` list:
```tsx
const TONES = [
  { value: "speels", label: "Speels" },
  { value: "zakelijk", label: "Zakelijk" },
  { value: "kindvriendelijk", label: "Kindvriendelijk" },
  { value: "verhalend", label: "Verhalend" },
];
```
Render a `<select aria-label="Toon">` in the Verhaal header (next to "Regenereer"), bound to `tone`/`setTone`.
2. Implement Regenereer. Replace the no-op `onClick` on the "Regenereer" `<Button>` with:
```tsx
async function handleRegenerate() {
  if (activeStopOrder === undefined) return;
  const factKeys = activePoi.facts.filter((f) => includedFacts[f.key] ?? true).map((f) => f.key);
  setRegenerating(true);
  try {
    const result = await generateStopContent(activeStopOrder, { fact_keys: factKeys, tone });
    setStory(result.story);
    setPrompt(result.question.prompt);
    setAnswer(result.question.answer ?? "");
    setHint(result.question.hint ?? "");
    setQuestionType(result.question.type as QuestionType);
    setGatesNext(Boolean(result.question.gates) && canGate(result.question.type as QuestionType));
    await saveStopContent(activeStopOrder, { story: result.story, question: result.question });
  } finally {
    setRegenerating(false);
  }
}
```
Add `const [regenerating, setRegenerating] = useState(false);` and pull `generateStopContent` from `useDraft()`. Set the Regenereer button `disabled={regenerating}` and label "Genereren…" while regenerating.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/screens/StopEditor.test.tsx`:
```tsx
test("Regenereer generates from selected facts and fills the fields", async () => {
  const fact = { key: "build_year", value: "1370", source: { name: "Wikidata", license: "CC0", reference: "q1" } };
  const draftWithStop = {
    id: "d1", title: "t", city: "Haarlem", theme: "historical",
    start: { lat: 52.38, lon: 4.63 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p9", name: "Waag", location: { lat: 52.38, lon: 4.63 }, facts: [fact] }, story: "", question: null }],
    status: "concept", attributions: [],
  };
  const fetchMock = vi.fn((url: string) => {
    if (String(url).endsWith("/generate"))
      return Promise.resolve(new Response(JSON.stringify({ story: "Gegenereerd verhaal over 1370.", question: { type: "A", prompt: "In welk jaar?", answer: "1370", hint: null, gates: true } }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(draftWithStop), { status: 201 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.38, lon: 4.63 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  await userEvent.click(await screen.findByRole("button", { name: /Regenereer|Genereren/i }));
  const textarea = await screen.findByLabelText("Verhaal");
  await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toContain("Gegenereerd verhaal"));
  // the generate call carried the selected fact key
  const genCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/generate"));
  expect(JSON.parse(genCall![1].body).fact_keys).toEqual(["build_year"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- StopEditor`
Expected: FAIL (Regenereer is a no-op; no Toon select).

- [ ] **Step 3: Implement** per the change list.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- StopEditor`
Expected: PASS (all StopEditor tests). No `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "feat(frontend): StopEditor real Regenereer + tone selector"
```

---

### Task 9: Full verification + README

**Files:**
- Modify: `frontend/README.md`, `backend/README.md`

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the actual pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all tests pass (no `act(...)` warnings), typecheck clean, build succeeds. Report the test count.

- [ ] **Step 3: Update READMEs**

In `backend/README.md`, add the two new endpoints to the endpoint table: `PUT /drafts/{id}/stops/{order}` (save a stop's story/question; 422 on an invalid gating question) and `POST /drafts/{id}/stops/{order}/generate` (RAG-generate a grounded story + candidate question from selected facts; body `fact_keys`, `tone`). In `frontend/README.md`, extend the "Studio route creation" note (or add a "Stop authoring" subsection): the Stop editor now loads/edits/persists a stop's story + question, "Regenereer" generates a grounded story from the checked facts, a tone selector steers it, and edits autosave on blur. Add a manual smoke line (do NOT claim an interactive run): open a draft → click a stop → edit the story (it saves on blur) → pick facts + a tone → "Regenereer" fills the fields → reload and the stop keeps its content.

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md backend/README.md
git commit -m "docs: stop authoring endpoints + run notes"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §4.1 tone → T1; §4.2 author_content → T2; §4.3 set/generate stop content + §4.4 schemas → T3; §4.5 routers + the 422 mapping → T4; §5.1 api → T5; §5.2 store → T6; §5.3 StopEditor load/edit/save → T7, Regenereer + tone → T8; §7 guardrails → enforced across T2 (fact-scoped generation), T3/T4 (Question 422), T7 (UI answer-required block); §8 testing → tests in every task; §9 out-of-scope respected (no validation/publish, no per-fact answer binding, no prev/next).
- **Placeholder scan:** screen tasks (T7, T8) cite the existing file + give exact change lists and full test code; backend/logic tasks give full code.
- **Type consistency:** `StopContentUpdate`/`StopGenerateRequest`/`StopGenerateResult` field names match backend (T3) and frontend (T5); `set_stop_content`/`generate_stop_content` (T3) match the routes (T4) and the API clients `updateStopContent`/`generateStopContent` (T5) and store actions `saveStopContent`/`generateStopContent` (T6); `author_content(poi, theme, tone)` signature matches T2↔T3; `rephrase(..., tone=None)` matches T1↔T2; the StopEditor consumes `saveStopContent`/`generateStopContent` exactly as T6 defines them.
- **Note (ValueError→422):** the `Question` model raises `ValueError` for an invalid gating question; T4 adds an app-level `ValueError`→422 handler so the PUT returns 422 deterministically (verified by `test_put_stop_content_invalid_gating_question_is_422`). This is intentional and documented.

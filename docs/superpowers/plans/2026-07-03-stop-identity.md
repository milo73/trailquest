# Stop Identity (first-class Stop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Stop a first-class entity keyed by a stable `stop_id`; routes persist stop *references* and the store hydrates content on read, so editing/regenerating a stop reflects in every route that uses it.

**Architecture:** The domain models keep `stops` (each stop gains `id`). A generalized **stop store** holds `StopContent` keyed by `stop_id = f"{poi_id}::{theme}"`, versioned. `DraftStore.put` normalizes a draft to a `DraftRecord` (metadata + `stop_refs`) and writes each stop's content to the stop store; `DraftStore.get` hydrates refs → content → `DraftTrail`. Because reads hydrate from the shared store, edits propagate. Clean slate → no migration.

**Tech Stack:** Python/FastAPI/Pydantic/SQLite/pytest; Vite + React + TypeScript + Vitest.

## Source-of-truth convention

Backend tasks give full code (the store is the crux — give it complete). Frontend is a small additive type change. Read the current file before editing.

Backend runs from `backend/` after `source .venv/bin/activate`. Frontend from `frontend/`.

## Global Constraints

- `stop_id = f"{poi_id}::{theme.value}"` (via `stop_id_for`). Stable across regeneration (new version, same id).
- Models keep `stops` (hydrated); `Stop`/`DraftStop` gain `id: str = ""` (set on hydrate/normalize). No `stop_refs` on the domain models — refs live only in the store's `DraftRecord`.
- The stop store holds `StopContent` (order-free, content optional) keyed by `stop_id`; player and draft content share it (that IS the reuse).
- Player `active_trails` hydrates-once (stores the fully-hydrated `Trail`); the answer flow is unchanged.
- Clean slate → no migration/legacy-lift for refs; SQLite content table uses a fresh `(stop_id, version)` schema.
- **Durability note:** restart-durable drafts require `content_store=sqlite` alongside `draft_store=file` (content now lives in the stop store). MVP defaults are both `memory`; document, don't enforce.
- Offline-safe; backend CI green (ruff/format/mypy/pytest); UI Dutch; degrade rather than break.
- Frontend: existing suites stay green; typecheck clean; no new `act(...)` warnings.

---

### Task 1: Schemas — `StopContent`, `StopRef`, `stop_id_for`, stop `id`

**Files:**
- Modify: `backend/app/models/schemas.py`
- Test: `backend/tests/test_stop_identity_schemas.py`

**Interfaces:**
- Produces: `stop_id_for(poi_id, theme) -> str`; `StopContent{poi, story?, questions, primary_question_index?}`; `StopRef{stop_id, order}`; `Stop.id: str`; `DraftStop.id: str`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_stop_identity_schemas.py`:
```python
from app.models.schemas import (
    POI, DraftStop, GeoPoint, Question, QuestionType, Stop, StopContent, StopRef, Theme, stop_id_for,
)


def _poi() -> POI:
    return POI(id="grote-markt", name="Grote Markt", location=GeoPoint(lat=52.0, lon=4.0))


def _q() -> Question:
    return Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")


def test_stop_id_for_encodes_poi_and_theme():
    assert stop_id_for("grote-markt", Theme.HISTORICAL) == "grote-markt::historical"


def test_stop_and_draftstop_have_id_defaulting_empty():
    s = Stop(order=1, poi=_poi(), story="s", questions=[_q()], primary_question_index=0)
    assert s.id == ""
    d = DraftStop(order=1, poi=_poi())
    assert d.id == ""


def test_stopcontent_is_order_free_and_optional():
    c = StopContent(poi=_poi())
    assert c.story is None and c.questions == [] and c.primary_question_index is None
    c2 = StopContent(poi=_poi(), story="s", questions=[_q()], primary_question_index=0)
    assert c2.story == "s"


def test_stopref_shape():
    r = StopRef(stop_id="grote-markt::historical", order=2)
    assert r.stop_id == "grote-markt::historical" and r.order == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_stop_identity_schemas.py -q`
Expected: FAIL (imports missing).

- [ ] **Step 3: Implement**

In `backend/app/models/schemas.py`:
- Add `id: str = ""` to `Stop` (as the first field after the docstring is fine) and to `DraftStop`.
- Add these classes/function (near `Stop`/`Theme`; `Theme` and `POI`/`Question` already exist):
```python
def stop_id_for(poi_id: str, theme: Theme) -> str:
    """Stable content-identity key for a (POI × theme) stop."""
    return f"{poi_id}::{theme.value}"


class StopContent(BaseModel):
    """Authoritative, order-free content of a stop (draft-shaped: content optional).
    Stored once per ``stop_id`` and hydrated into a Stop/DraftStop per route."""

    poi: POI
    story: str | None = None
    questions: list[Question] = Field(default_factory=list)
    primary_question_index: int | None = None


class StopRef(BaseModel):
    stop_id: str
    order: int
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_stop_identity_schemas.py -q && ruff check app && mypy app/models/schemas.py`
Expected: PASS; clean. (Other suites stay green — `id` defaults to "".)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/schemas.py backend/tests/test_stop_identity_schemas.py
git commit -m "feat(backend): StopContent/StopRef/stop_id_for + stop id field"
```

---

### Task 2: Stop store keyed by `stop_id` + `build_stop` projection

**Files:**
- Modify: `backend/app/cache/store.py` (content store → stop store)
- Modify: `backend/app/services/content_service.py` (`build_stop`)
- Test: `backend/tests/test_content_store.py` (rewrite to the stop-id API), `backend/tests/test_stop_store.py` (new)

**Interfaces:**
- Consumes: `StopContent`, `stop_id_for` (Task 1).
- Produces: `content_cache.get(stop_id) -> StopContent | None`; `content_cache.put(stop_id, content, *, source, review_status) -> int`; `content_cache.get_for(poi_id, theme)`; `build_stop(poi, theme, order) -> Stop` (id-addressable).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_stop_store.py`:
```python
from app.cache.store import InMemoryContentStore
from app.models.schemas import POI, GeoPoint, Question, QuestionType, StopContent


def _content(story: str) -> StopContent:
    return StopContent(
        poi=POI(id="p", name="P", location=GeoPoint(lat=52.0, lon=4.0)),
        story=story,
        questions=[Question(type=QuestionType.DATA_BOUND, prompt="?", answer="1")],
        primary_question_index=0,
    )


def test_put_get_by_stop_id_latest_wins():
    store = InMemoryContentStore()
    assert store.get("p::historical") is None
    assert store.put("p::historical", _content("v1")) == 1
    assert store.put("p::historical", _content("v2")) == 2
    got = store.get("p::historical")
    assert got is not None and got.story == "v2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_stop_store.py -q`
Expected: FAIL (get/put take `(poi_id, theme)` today).

- [ ] **Step 3: Rework the content store**

In `backend/app/cache/store.py`, change the import to include `StopContent, stop_id_for` (and drop `Theme`/`Stop` from the content-store parts if now unused — keep `Trail`/`DraftTrail`). Replace `ContentEntry` and the `ContentStore`/`InMemoryContentStore`/`SqliteContentStore` bodies to key on `stop_id` and hold `StopContent`:

```python
@dataclass(frozen=True)
class ContentEntry:
    stop_id: str
    version: int
    content: StopContent
    source: str
    review_status: ReviewStatus
    created_at: str


class ContentStore(ABC):
    @abstractmethod
    def get(self, stop_id: str) -> StopContent | None: ...
    @abstractmethod
    def put(self, stop_id: str, content: StopContent, *, source: str = "", review_status: ReviewStatus = "unreviewed") -> int: ...
    @abstractmethod
    def sample_unreviewed(self, limit: int = 20) -> list[ContentEntry]: ...
    @abstractmethod
    def set_review_status(self, stop_id: str, version: int, status: ReviewStatus) -> None: ...
    @abstractmethod
    def clear(self) -> None: ...

    def get_for(self, poi_id: str, theme: Theme) -> StopContent | None:
        return self.get(stop_id_for(poi_id, theme))
```

`InMemoryContentStore`: `self._entries: dict[str, list[ContentEntry]]` keyed by `stop_id`; `get` returns `versions[-1].content`; `put` appends `ContentEntry(stop_id, len+1, content, source, review_status, _now())`; `set_review_status(stop_id, version, status)` updates the matching entry; `sample_unreviewed` unchanged shape.

`SqliteContentStore`: `CREATE TABLE IF NOT EXISTS content (stop_id TEXT NOT NULL, version INTEGER NOT NULL, content_json TEXT NOT NULL, source TEXT NOT NULL, review_status TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (stop_id, version))`; `get`/`put`/`set_review_status`/`sample_unreviewed` operate on `stop_id`, storing `content.model_dump_json()` and reading `StopContent.model_validate_json(...)`. (Keep `Theme` import for `get_for` typing only.)

`import Theme` still needed for `get_for`. Keep `from app.models.schemas import DraftTrail, StopContent, Theme, Trail, stop_id_for` (drop `Stop` if unused here).

- [ ] **Step 4: Update `build_stop`**

In `backend/app/services/content_service.py`, import `StopContent, stop_id_for` and rewrite `build_stop`:
```python
def _is_complete(c: StopContent) -> bool:
    return bool(c.story and c.story.strip()) and len(c.questions) >= 1 and c.primary_question_index is not None


def build_stop(poi: POI, theme: Theme, order: int) -> Stop:
    sid = stop_id_for(poi.id, theme)
    cached = content_cache.get(sid)
    if cached is not None and _is_complete(cached):
        assert cached.story is not None
        return Stop(
            id=sid, order=order, poi=cached.poi, story=cached.story,
            questions=cached.questions, primary_question_index=cached.primary_question_index or 0,
        )

    questions, primary_index = _build_questions(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background
        )
    except RuntimeError:
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background
        )
        return Stop(id=sid, order=order, poi=poi, story=story, questions=questions, primary_question_index=primary_index)

    content = StopContent(poi=poi, story=story, questions=questions, primary_question_index=primary_index)
    content_cache.put(sid, content, source=f"{settings.llm_provider}:{settings.llm_model}")
    return Stop(id=sid, order=order, poi=poi, story=story, questions=questions, primary_question_index=primary_index)
```

- [ ] **Step 5: Update the content-store tests**

Rewrite `backend/tests/test_content_store.py` so it drives the new stop-id API (`put(stop_id, StopContent)`, `get(stop_id)`, `get_for(poi_id, theme)`), preserving each test's intent (versioning, latest-wins, review sampling). Any test that asserted `build_stop` cache reuse now asserts it via `get_for`/`stop_id`.

- [ ] **Step 6: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the count. Fix any straggler that used the old `content_cache.get(poi_id, theme)` signature. If `ruff format --check .` flags files, run `ruff format .`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/cache/store.py backend/app/services/content_service.py backend/tests/
git commit -m "feat(backend): stop store keyed by stop_id (StopContent) + build_stop projection"
```

---

### Task 3: DraftStore normalize/hydrate (edit propagation)

**Files:**
- Modify: `backend/app/cache/store.py` (`DraftStore` backends + `DraftRecord`)
- Test: `backend/tests/test_draft_hydration.py` (new)

**Interfaces:**
- Consumes: the stop store (Task 2), `StopContent`/`StopRef`/`stop_id_for` (Task 1).
- Produces: `DraftStore.put(draft)` normalizes + writes content; `DraftStore.get`/`list_drafts` hydrate. `draft_service` is unchanged (it operates on the hydrated `DraftTrail`).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_draft_hydration.py`:
```python
from app.cache.store import InMemoryDraftStore, content_cache
from app.models.schemas import (
    POI, DraftStop, DraftTrail, GeoPoint, Question, QuestionType, Theme,
)


def _draft(draft_id: str, poi: POI) -> DraftTrail:
    return DraftTrail(
        id=draft_id, title="t", city="Haarlem", theme=Theme.HISTORICAL,
        start=GeoPoint(lat=52.0, lon=4.0), requested_distance_km=5, actual_distance_km=1,
        estimated_duration_min=10,
        stops=[DraftStop(order=1, poi=poi, story="oud verhaal",
                         questions=[Question(type=QuestionType.DATA_BOUND, prompt="?", answer="1")],
                         primary_question_index=0)],
    )


def test_put_sets_stop_id_and_get_hydrates():
    content_cache.clear()
    store = InMemoryDraftStore()
    poi = POI(id="grote-markt", name="Grote Markt", location=GeoPoint(lat=52.0, lon=4.0))
    store.put(_draft("d1", poi))
    got = store.get("d1")
    assert got is not None
    assert got.stops[0].id == "grote-markt::historical"
    assert got.stops[0].story == "oud verhaal"


def test_edit_in_one_draft_propagates_to_another_sharing_the_stop():
    content_cache.clear()
    store = InMemoryDraftStore()
    poi = POI(id="grote-markt", name="Grote Markt", location=GeoPoint(lat=52.0, lon=4.0))
    store.put(_draft("A", poi))
    store.put(_draft("B", poi))  # both reference grote-markt::historical

    a = store.get("A")
    a.stops[0].story = "nieuw verhaal"
    store.put(a)

    b = store.get("B")
    assert b.stops[0].story == "nieuw verhaal"  # edit propagated via the shared stop store
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_draft_hydration.py -q`
Expected: FAIL (drafts embed; no propagation; `id` not set).

- [ ] **Step 3: Implement**

In `backend/app/cache/store.py`, add a `DraftRecord` model + normalize/hydrate helpers and rewrite both draft-store backends to persist records and hydrate through `content_cache`. Add imports: `DraftStatus, DraftStop, GeoPoint, StopContent, StopRef, stop_id_for` (as needed).

```python
class DraftRecord(BaseModel):
    id: str
    title: str
    city: str
    theme: Theme
    start: GeoPoint
    requested_distance_km: float
    actual_distance_km: float
    estimated_duration_min: int
    status: DraftStatus
    attributions: list[str]
    stop_refs: list[StopRef]


def _normalize_draft(draft: DraftTrail) -> DraftRecord:
    refs: list[StopRef] = []
    for s in draft.stops:
        sid = stop_id_for(s.poi.id, draft.theme)
        s.id = sid  # response-ready id
        content = StopContent(
            poi=s.poi, story=s.story, questions=s.questions,
            primary_question_index=s.primary_question_index,
        )
        latest = content_cache.get(sid)
        if latest != content:  # only version on change
            content_cache.put(sid, content, source="draft")
        refs.append(StopRef(stop_id=sid, order=s.order))
    return DraftRecord(
        id=draft.id, title=draft.title, city=draft.city, theme=draft.theme, start=draft.start,
        requested_distance_km=draft.requested_distance_km, actual_distance_km=draft.actual_distance_km,
        estimated_duration_min=draft.estimated_duration_min, status=draft.status,
        attributions=draft.attributions, stop_refs=refs,
    )


def _hydrate_draft(record: DraftRecord) -> DraftTrail:
    stops: list[DraftStop] = []
    for ref in record.stop_refs:
        content = content_cache.get(ref.stop_id)
        if content is None:
            continue
        stops.append(DraftStop(
            id=ref.stop_id, order=ref.order, poi=content.poi, story=content.story,
            questions=content.questions, primary_question_index=content.primary_question_index,
        ))
    return DraftTrail(
        id=record.id, title=record.title, city=record.city, theme=record.theme, start=record.start,
        requested_distance_km=record.requested_distance_km, actual_distance_km=record.actual_distance_km,
        estimated_duration_min=record.estimated_duration_min, status=record.status,
        attributions=record.attributions, stops=stops,
    )
```

`InMemoryDraftStore`: store `dict[str, DraftRecord]`; `put(draft)` → `self._records[draft.id] = _normalize_draft(draft)`; `get(id)` → `_hydrate_draft(rec)` if present; `list_drafts` hydrates all; `clear` empties.

`FileDraftStore`: `put` writes `_normalize_draft(draft).model_dump_json(indent=2)` to `<id>.json`; `get` reads → `DraftRecord.model_validate_json(...)` → `_hydrate_draft`; `list_drafts` hydrates each file; `clear` unlinks.

`draft_service` needs **no change** — it mutates the hydrated `DraftTrail` and calls `drafts.put`. (Verify in Step 4; if any function returned an un-hydrated stale object, change its final `return draft` to `return drafts.get(draft_id)`.)

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Update any existing draft test that asserted a specific stored shape. Confirm `validate`/`publish`/answer flows still pass on the hydrated drafts. Report the count.

- [ ] **Step 5: Commit**

```bash
git add backend/app/cache/store.py backend/tests/
git commit -m "feat(backend): DraftStore normalizes to refs + hydrates (edit propagation)"
```

---

### Task 4: Frontend — `id` on Stop/DraftStop

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: any fixture/mock constructing a `Stop`/`DraftStop` inline (add `id`)
- Test: existing suites (adjust fixtures)

**Interfaces:**
- Consumes: the backend `id` field (Tasks 1–3).
- Produces: `Stop`/`DraftStop` types with `id: string`.

- [ ] **Step 1: Update the types**

In `frontend/src/api/types.ts`, add `id: string;` to `interface Stop` and `interface DraftStop`.

- [ ] **Step 2: Run typecheck to find fixture gaps**

Run: `cd frontend && npm run typecheck`
Expected: errors in fixtures/mocks that build `Stop`/`DraftStop` without `id`.

- [ ] **Step 3: Implement**

Add `id` to each failing fixture/mock (e.g. `frontend/src/studio/mock/stop.ts`, quester/studio test fixtures) — use a representative value like `"grote-markt::historical"` or `""`. Only additive; no behavior change.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test && npm run typecheck`
Expected: all PASS; clean; no new `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src
git commit -m "feat(frontend): id on Stop/DraftStop"
```

---

### Task 5: Full verification + README

**Files:**
- Modify: `backend/README.md`, `frontend/README.md`

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: tests pass (pre-existing "Body has already been read" stderr noise is not a failure), typecheck clean, build ok. Report the count.

- [ ] **Step 3: Update READMEs**

`backend/README.md`: note stops are now content-identified by `stop_id = poi_id::theme`; the content store is keyed by `stop_id` and holds `StopContent`; drafts persist `stop_refs` and hydrate content on read, so editing a stop reflects in every draft/trail using it; add the durability note (restart-durable drafts need `content_store=sqlite` with `draft_store=file`). `frontend/README.md`: note `Stop`/`DraftStop` carry an `id` (the shared `stop_id`). Verify against the code.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md frontend/README.md
git commit -m "docs: stop identity (stop_id, shared stop store, edit propagation)"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3.1 schemas → T1; §3.2 stop store + §3.4 build_stop → T2; §3.3 DraftStore normalize/hydrate → T3; §4 frontend → T4; §5 testing → tests in T1–T3 (incl. the edit-propagation proof) + T4; §6 out-of-scope respected (POI still embedded; player hydrate-once; no migration).
- **Placeholder scan:** T1–T3 give full store/service code; T2/T3 note updating existing store/draft tests to the new shapes.
- **Type consistency:** `stop_id_for`/`StopContent`/`StopRef` names identical across schema (T1), store (T2/T3), and `build_stop` (T2); `content_cache.get(stop_id)`/`put(stop_id, content)` used consistently; `DraftRecord.stop_refs` ↔ `_hydrate_draft`; `Stop.id`/`DraftStop.id` (T1) surfaced by normalize/build_stop and typed in the frontend (T4). `draft_service` unchanged — verified against its use of `drafts.put`/`drafts.get`.

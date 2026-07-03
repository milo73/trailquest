# Stage 1 — Multiple Questions per Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stop carries many questions (one primary, rest bonus); the primary's type gates the next stop, bonus questions never do — across model, services, answer API, player, and studio.

**Architecture:** `Stop`/`DraftStop` move from a single `question` to `questions: list[Question]` + `primary_question_index`; pydantic `mode="before"` validators lift legacy singular payloads so persisted drafts and cached JSON load unchanged. The answer flow adds `evaluate_in_stop` (only the primary gates) and translates its feedback to Dutch. Publish validation adds a `primary_gate` check. Frontend migrates the shape, adds a bonus-question section to the player, and a multi-question authoring UI to the studio.

**Tech Stack:** Python/FastAPI/Pydantic v2/pytest; Vite + React + TypeScript + Vitest + RTL.

## Source-of-truth convention

Backend tasks give full code. Frontend screen tasks (T5–T6) modify large existing files — the plan cites them with precise edits and gives full test code; read the current file before editing.

Backend runs from `backend/` after `source .venv/bin/activate`. Frontend from `frontend/` with `npm test`.

## Global Constraints

- **Primary vs bonus:** exactly one `primary_question_index` per stop; the primary's *type* decides gating (A/D block, C gates-through, B honor); bonus questions return `unlocked_next=False` always.
- **Model invariant:** `Stop` requires `0 <= primary_question_index < len(questions)` (NOT "must gate"); `DraftStop.primary_question_index` is `int | None` (None only when `questions` empty).
- **Publish gate:** a new blocking `primary_gate` validation check requires the primary question to be a gating type (A/D).
- **Back-compat, no manual migration:** `@model_validator(mode="before")` on `Stop` and `DraftStop` lifts a legacy `question` into `questions=[question]`.
- **Player API:** answer stays keyed on `stop_order`; new optional `question_index` (None → primary).
- Offline-safe; backend CI green (`ruff check`, `ruff format --check`, `mypy app`, `pytest`); UI strings Dutch; no `window.confirm/alert/prompt`.
- Frontend: existing suites stay green; `npm run typecheck` clean; no new `act(...)` warnings. Pre-existing "Body has already been read" stderr noise is not a failure.

---

### Task 1: Backend model — multi-question Stop/DraftStop + back-compat + request shapes

**Files:**
- Modify: `backend/app/models/schemas.py`
- Test: `backend/tests/test_multi_question_model.py`

**Interfaces:**
- Produces: `Stop{questions: list[Question], primary_question_index: int, primary_question}`, `DraftStop{questions: list[Question], primary_question_index: int | None}`, `AnswerRequest.question_index: int | None`, `StopContentUpdate{questions, primary_question_index}`, `StopGenerateResult{questions, primary_question_index}`. Legacy `question` payloads lift automatically.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_multi_question_model.py`:
```python
import pytest

from app.models.schemas import DraftStop, GeoPoint, POI, Question, QuestionType, Stop


def _poi() -> POI:
    return POI(id="p1", name="Toren", location=GeoPoint(lat=52.0, lon=4.0))


def _a() -> Question:
    return Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")


def _c() -> Question:
    return Question(type=QuestionType.OPEN_REFLECTION, prompt="Kijk rond?")


def test_stop_holds_questions_and_primary():
    stop = Stop(order=1, poi=_poi(), story="s", questions=[_a(), _c()], primary_question_index=0)
    assert len(stop.questions) == 2
    assert stop.primary_question is stop.questions[0]


def test_stop_primary_index_out_of_range_raises():
    with pytest.raises(ValueError):
        Stop(order=1, poi=_poi(), story="s", questions=[_a()], primary_question_index=3)


def test_stop_reflection_primary_is_allowed():
    # a reflection primary is playable (gates-through), not a crash
    stop = Stop(order=1, poi=_poi(), story="s", questions=[_c()], primary_question_index=0)
    assert stop.primary_question.type is QuestionType.OPEN_REFLECTION


def test_stop_lifts_legacy_singular_question():
    legacy = {"order": 1, "poi": _poi().model_dump(), "story": "s", "question": _a().model_dump()}
    stop = Stop.model_validate(legacy)
    assert stop.questions[0].answer == "78"
    assert stop.primary_question_index == 0


def test_draftstop_defaults_and_legacy_lift():
    empty = DraftStop(order=1, poi=_poi())
    assert empty.questions == [] and empty.primary_question_index is None
    legacy = {"order": 2, "poi": _poi().model_dump(), "question": _a().model_dump()}
    lifted = DraftStop.model_validate(legacy)
    assert lifted.questions[0].answer == "78" and lifted.primary_question_index == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_multi_question_model.py -q`
Expected: FAIL (Stop has no `questions`).

- [ ] **Step 3: Implement the model changes**

In `backend/app/models/schemas.py`, add to the imports at the top: `from typing import Any` and add `model_validator` to the pydantic import (`from pydantic import BaseModel, Field, model_validator`).

Replace the `Stop` class:
```python
class Stop(BaseModel):
    """One stop on a trail: a POI, its story, and one or more questions.

    Exactly one question is the *primary* (``primary_question_index``): its type
    decides gating (A/D gate on correctness, C gates-through, B honor). The rest
    are bonus questions — answerable, but they never unlock the next stop.
    """

    order: int
    poi: POI
    story: str  # LLM-generated narrative, grounded in poi.facts
    questions: list[Question] = Field(min_length=1)
    primary_question_index: int

    @model_validator(mode="before")
    @classmethod
    def _lift_legacy_question(cls, data: Any) -> Any:
        if isinstance(data, dict) and "question" in data and "questions" not in data:
            q = data["question"]
            data = {k: v for k, v in data.items() if k != "question"}
            data["questions"] = [q] if q is not None else []
            data.setdefault("primary_question_index", 0)
        return data

    def model_post_init(self, __context: object) -> None:
        if not 0 <= self.primary_question_index < len(self.questions):
            raise ValueError("primary_question_index out of range")

    @property
    def primary_question(self) -> Question:
        return self.questions[self.primary_question_index]
```

Replace the `DraftStop` class:
```python
class DraftStop(BaseModel):
    """A stop on a draft trail. Unlike a player-facing ``Stop``, ``story`` and
    ``questions`` are optional — they are authored later in the studio."""

    order: int
    poi: POI
    story: str | None = None
    questions: list[Question] = Field(default_factory=list)
    primary_question_index: int | None = None

    @model_validator(mode="before")
    @classmethod
    def _lift_legacy_question(cls, data: Any) -> Any:
        if isinstance(data, dict) and "question" in data and "questions" not in data:
            q = data["question"]
            data = {k: v for k, v in data.items() if k != "question"}
            data["questions"] = [q] if q is not None else []
            if q is not None:
                gates = q.get("gates") if isinstance(q, dict) else getattr(q, "gates", False)
                data["primary_question_index"] = 0 if gates else None
        return data
```

In `AnswerRequest`, add `question_index: int | None = None`.

Replace `StopContentUpdate`:
```python
class StopContentUpdate(BaseModel):
    story: str | None = None
    questions: list[Question] | None = None
    primary_question_index: int | None = None
```

Replace `StopGenerateResult`:
```python
class StopGenerateResult(BaseModel):
    story: str
    questions: list[Question]
    primary_question_index: int | None = None
```

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_multi_question_model.py -q && ruff check app && mypy app`
Expected: PASS; clean. (Other suites go red until later tasks — that's expected mid-plan; do not fix them here.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/schemas.py backend/tests/test_multi_question_model.py
git commit -m "feat(backend): Stop/DraftStop hold questions + primary index (legacy-lift)"
```

---

### Task 2: Backend — `_build_questions`

**Files:**
- Modify: `backend/app/services/content_service.py`
- Test: `backend/tests/test_dutch_content.py` (extend), `backend/tests/test_build_questions.py` (new)

**Interfaces:**
- Consumes: `Stop`/`StopGenerateResult` shapes from Task 1.
- Produces: `content_service._build_questions(poi) -> tuple[list[Question], int]`; `build_stop(...) -> Stop` (multi-question); `author_content(poi, theme, tone) -> tuple[str, list[Question], int]`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_build_questions.py`:
```python
from app.models.schemas import POI, Fact, GeoPoint, QuestionType, Source, SourceLicense
from app.services.content_service import _build_questions


def _fact(key: str, value: str) -> Fact:
    return Fact(key=key, value=value, source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"))


def test_multi_fact_poi_yields_data_bound_plus_reflection():
    poi = POI(id="p", name="Toren", location=GeoPoint(lat=52.0, lon=4.0),
              facts=[_fact("height_m", "78"), _fact("build_year", "1520")])
    questions, primary = _build_questions(poi)
    assert primary == 0
    assert [q.type for q in questions] == [QuestionType.DATA_BOUND, QuestionType.DATA_BOUND, QuestionType.OPEN_REFLECTION]
    assert questions[0].answer == "78"


def test_no_data_bound_fact_yields_reflection_primary():
    poi = POI(id="p", name="Plein", location=GeoPoint(lat=52.0, lon=4.0))
    questions, primary = _build_questions(poi)
    assert primary == 0
    assert [q.type for q in questions] == [QuestionType.OPEN_REFLECTION]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_build_questions.py -q`
Expected: FAIL (`_build_questions` not defined).

- [ ] **Step 3: Implement**

In `backend/app/services/content_service.py`, replace `_build_question` with:
```python
def _build_questions(poi: POI) -> tuple[list[Question], int]:
    """Generate a stop's questions: one Type-A per data-bound fact (the primary
    gates), plus a trailing Type-C reflection bonus. The list is never empty; the
    primary is index 0 — the first data-bound question when any exist, else the
    reflection (playable, gates-through)."""
    questions: list[Question] = []
    for fact in poi.facts:
        template = _DATA_BOUND_TEMPLATES.get(fact.key)
        if template:
            questions.append(
                Question(
                    type=QuestionType.DATA_BOUND,
                    prompt=template.format(name=poi.name),
                    answer=fact.value,
                    hint=(
                        f"Tip: het gaat over de "
                        f"{_HINT_LABELS.get(fact.key, fact.key.replace('_', ' '))}."
                    ),
                )
            )
    questions.append(
        Question(
            type=QuestionType.OPEN_REFLECTION,
            prompt=f"Kijk eens rond bij {poi.name}. Wat denk je dat hier vroeger is gebeurd?",
        )
    )
    return questions, 0
```

Update `build_stop` — replace its body's `question = _build_question(poi)` and the two `Stop(...)` constructions:
```python
    questions, primary_index = _build_questions(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background
        )
    except RuntimeError:
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background
        )
        return Stop(
            order=order, poi=poi, story=story,
            questions=questions, primary_question_index=primary_index,
        )

    stop = Stop(
        order=order, poi=poi, story=story,
        questions=questions, primary_question_index=primary_index,
    )
    content_cache.put(poi.id, theme, stop, source=f"{settings.llm_provider}:{settings.llm_model}")
    return stop
```

Change `author_content` signature + return to `tuple[str, list[Question], int]`:
```python
def author_content(
    poi: POI, theme: Theme, tone: str | None = None
) -> tuple[str, list[Question], int]:
    questions, primary_index = _build_questions(poi)
    try:
        story = get_llm_provider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    except RuntimeError:
        story = StubProvider().rephrase(
            poi_name=poi.name, theme=theme, facts=poi.facts, background=poi.background, tone=tone
        )
    return story, questions, primary_index
```

- [ ] **Step 4: Run tests**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_build_questions.py -q && ruff check app && mypy app`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/content_service.py backend/tests/test_build_questions.py
git commit -m "feat(backend): _build_questions (data-bound primary + reflection bonus)"
```

---

### Task 3: Backend — answer flow (`evaluate_in_stop`, Dutch feedback, trails API)

**Files:**
- Modify: `backend/app/services/answer_service.py`
- Modify: `backend/app/api/trails.py`
- Test: `backend/tests/test_answer_in_stop.py` (new), `backend/tests/test_answer_service.py` (Dutch feedback)

**Interfaces:**
- Consumes: `Stop.questions`/`primary_question_index` (Task 1).
- Produces: `answer_service.evaluate_in_stop(stop, question_index, submitted, attempt) -> AnswerResult`; Dutch feedback in `evaluate`; `POST /trails/{id}/answer` targets a question index, only the primary unlocks.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_answer_in_stop.py`:
```python
from app.models.schemas import GeoPoint, POI, Question, QuestionType, Stop
from app.services import answer_service


def _stop() -> Stop:
    primary = Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")
    bonus = Question(type=QuestionType.DATA_BOUND, prompt="Bouwjaar?", answer="1520")
    return Stop(order=1, poi=POI(id="p", name="Toren", location=GeoPoint(lat=52.0, lon=4.0)),
                story="s", questions=[primary, bonus], primary_question_index=0)


def test_primary_correct_unlocks():
    r = answer_service.evaluate_in_stop(_stop(), 0, "78", 1)
    assert r.correct and r.unlocked_next


def test_bonus_correct_does_not_unlock():
    r = answer_service.evaluate_in_stop(_stop(), 1, "1520", 1)
    assert r.correct and r.unlocked_next is False


def test_none_index_targets_primary():
    r = answer_service.evaluate_in_stop(_stop(), None, "78", 1)
    assert r.unlocked_next


def test_primary_feedback_is_dutch():
    r = answer_service.evaluate_in_stop(_stop(), 0, "78", 1)
    assert "volgende stop" in r.feedback.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_answer_in_stop.py -q`
Expected: FAIL (`evaluate_in_stop` not defined).

- [ ] **Step 3: Implement**

In `backend/app/services/answer_service.py`, translate the five feedback strings in `evaluate` to Dutch:
- reflection → `"Bedankt voor het delen — hier is geen fout antwoord."`
- observe/count → `"Goed gespot! (We vertrouwen je telling hier.)"`
- correct → `"Correct! Door naar de volgende stop."`
- reveal-after-max → `f"Het antwoord was: {question.answer}. We gaan verder."`
- wrong → `"Net niet."`; with hint → `f"Net niet. Tip: {question.hint}"`

Then add (import `Stop` from `app.models.schemas`):
```python
def evaluate_in_stop(
    stop: Stop, question_index: int | None, submitted: str, attempt: int
) -> AnswerResult:
    """Evaluate an answer for a specific question in a stop. Only the primary
    question gates; bonus questions return feedback but never unlock the next stop."""
    idx = question_index if question_index is not None else stop.primary_question_index
    result = evaluate(stop.questions[idx], submitted, attempt)
    if idx != stop.primary_question_index:
        return result.model_copy(update={"unlocked_next": False})
    return result
```

In `backend/app/api/trails.py`, replace the body of `submit_answer` after the stop lookup:
```python
    idx = req.question_index if req.question_index is not None else stop.primary_question_index
    if not 0 <= idx < len(stop.questions):
        raise HTTPException(status_code=404, detail="Question not found")
    return answer_service.evaluate_in_stop(stop, idx, req.answer, req.attempt)
```

- [ ] **Step 4: Add the Dutch-feedback assertion**

In `backend/tests/test_answer_service.py`, add:
```python
def test_correct_feedback_is_dutch():
    from app.models.schemas import Question, QuestionType
    from app.services import answer_service
    q = Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")
    assert "volgende stop" in answer_service.evaluate(q, "78", 1).feedback.lower()
```

- [ ] **Step 5: Run tests**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_answer_in_stop.py tests/test_answer_service.py -q && ruff check app && mypy app`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/answer_service.py backend/app/api/trails.py backend/tests/test_answer_in_stop.py backend/tests/test_answer_service.py
git commit -m "feat(backend): evaluate_in_stop (primary-only gating) + Dutch feedback"
```

---

### Task 4: Backend — draft_service threading + `primary_gate` validation + drafts API

**Files:**
- Modify: `backend/app/services/draft_service.py`
- Modify: `backend/app/api/drafts.py`
- Test: `backend/tests/test_validate.py` (extend), `backend/tests/test_drafts_api.py` (extend or the relevant existing draft test file)

**Interfaces:**
- Consumes: `StopContentUpdate`/`StopGenerateResult`/`author_content` (Tasks 1–2), `evaluate_in_stop` unaffected.
- Produces: `set_stop_content(..., questions=None, primary_question_index=None)`; `generate_stop_content(...) -> tuple[str, list[Question], int] | None`; a `primary_gate` blocking check in `validate`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_validate.py` (reuse its `_draft`/`_stop` helpers — update those helpers to build `DraftStop(..., questions=[q], primary_question_index=0)` instead of `question=q`):
```python
def test_primary_gate_blocks_when_primary_not_gating():
    from app.models.schemas import Question, QuestionType
    reflection = Question(type=QuestionType.OPEN_REFLECTION, prompt="?")
    stop = _stop(1)
    stop.questions = [reflection]
    stop.primary_question_index = 0
    result = draft_service.validate(_draft([stop, _stop(2)]))
    assert any(c.id == "primary_gate" and c.status == "blocking" for c in result.checks)


def test_primary_gate_ok_with_data_bound_primary():
    result = draft_service.validate(_draft([_stop(1), _stop(2)]))
    assert any(c.id == "primary_gate" and c.status == "ok" for c in result.checks)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_validate.py -q`
Expected: FAIL (no `primary_gate` check; helpers still use `question=`).

- [ ] **Step 3: Implement**

In `backend/app/services/draft_service.py`:

`set_stop_content` — replace signature + body's question handling:
```python
def set_stop_content(
    draft_id: str,
    order: int,
    *,
    story: str | None = None,
    questions: list[Question] | None = None,
    primary_question_index: int | None = None,
) -> DraftTrail | None:
    draft = drafts.get(draft_id)
    if draft is None:
        return None
    stop = next((s for s in draft.stops if s.order == order), None)
    if stop is None:
        return None
    if story is not None:
        stop.story = story
    if questions is not None:
        stop.questions = questions
        stop.primary_question_index = primary_question_index
    draft.attributions = _attributions(draft.stops)
    drafts.put(draft)
    return draft
```

`generate_stop_content` — return type becomes `tuple[str, list[Question], int] | None`; its final line stays `return content_service.author_content(poi, draft.theme, tone)` (now a 3-tuple).

In `validate`, keep the `content` check as "every stop has a story" (change its `complete` filter to `s.story and s.story.strip()`), and add a `primary_gate` check after `grounding`:
```python
    def _has_gating_primary(s: DraftStop) -> bool:
        return (
            s.primary_question_index is not None
            and 0 <= s.primary_question_index < len(s.questions)
            and s.questions[s.primary_question_index].gates
        )

    gated = [s for s in stops if _has_gating_primary(s)]
    checks.append(
        ValidationCheck(
            id="primary_gate",
            label="Poortvraag",
            detail=f"{len(gated)} / {len(stops)} stops hebben een geldige poortvraag",
            status=CheckStatus.BLOCKING if len(gated) < len(stops) else CheckStatus.OK,
        )
    )
```
Ensure `DraftStop` and `Question` are imported in `draft_service.py`.

In `backend/app/api/drafts.py`:
- `update_stop_content`: pass `questions=body.questions, primary_question_index=body.primary_question_index` to `set_stop_content` (drop the old `question=`).
- `generate_stop_content` endpoint: unpack the 3-tuple and return `StopGenerateResult(story=story, questions=questions, primary_question_index=primary_index)`.

- [ ] **Step 4: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Fix any remaining test that still constructs a single `question=` (update to `questions=[...]`, `primary_question_index=0`). Report the count. If `ruff format --check .` flags files, run `ruff format .`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/draft_service.py backend/app/api/drafts.py backend/tests/
git commit -m "feat(backend): draft content threading + primary_gate validation check"
```

---

### Task 5: Frontend — type migration + player multi-question + studio compile-adapt

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/quester/screens/Stop.tsx` (+ `Stop.test.tsx`)
- Modify: `frontend/src/studio/screens/StopEditor.tsx` (mechanical adapt to `questions`/`primary_question_index`, behavior preserved — single-question authoring bound to the primary)
- Modify: any mock/fixture using `.question` (e.g. `frontend/src/studio/mock/stop.ts`, `quester` fixtures) and `draftStore.tsx` `saveStopContent`/`generateStopContent` payloads

**Interfaces:**
- Consumes: backend shapes (Tasks 1–4).
- Produces: `Stop.questions`/`primary_question_index`, `DraftStop.questions`/`primary_question_index`, `AnswerRequest.question_index`, `StopContentUpdate`/`StopGenerateResult` mirror; the player renders the primary + a bonus section; the studio still compiles and saves.

Read the current `Stop.tsx` and `StopEditor.tsx` first. This task keeps the frontend green after the type change; the full multi-question authoring UI is Task 6.

**Type edits (`api/types.ts`):**
```ts
export interface Stop { order: number; poi: POI; story: string; questions: Question[]; primary_question_index: number; }
// DraftStop:
export interface DraftStop { order: number; poi: POI; story?: string | null; questions: Question[]; primary_question_index?: number | null; }
export interface AnswerRequest { stop_order: number; answer: string; attempt: number; question_index?: number | null; }
export interface StopContentUpdate { story?: string | null; questions?: Question[] | null; primary_question_index?: number | null; }
export interface StopGenerateResult { story: string; questions: Question[]; primary_question_index?: number | null; }
```

**Player `Stop.tsx`:**
- Replace `const { poi, story, question } = stop;` with
  `const { poi, story, questions } = stop; const primaryIndex = stop.primary_question_index; const question = questions[primaryIndex];`
  (the primary drives the existing gate UI unchanged).
- `handleSubmit` passes `question_index: primaryIndex`.
- Add a **bonus** section after the primary block: for each `questions[i]` where `i !== primaryIndex`, render a small card with the prompt, an answer input, a "Controleer" button, and inline feedback from a call to `submitAnswer(trail.id, { stop_order, answer, attempt: 1, question_index: i })` — using `result.feedback`/`result.revealed_answer`; **ignore `unlocked_next`** (bonus never advances). Keep it simple (local state per bonus index).

**Studio `StopEditor.tsx` (mechanical adapt — no new UI yet):**
- Wherever it reads `activeStop.question`/`sourceQuestion`, read the primary:
  `const primaryIndex = activeStop?.primary_question_index ?? 0; const sourceQuestion = activeStop?.questions?.[primaryIndex] ?? {…default…};`
- `handleRegenerate`: from `StopGenerateResult`, set the primary from `result.questions[result.primary_question_index ?? 0]` and save via `saveStopContent(order, { story: result.story, questions: result.questions, primary_question_index: result.primary_question_index })`.
- Saving the question: build the single edited primary question and send `{ questions: [question], primary_question_index: 0 }` (behavior preserved: one authored question, which is the primary). `draftStore.tsx` `saveStopContent` forwards `StopContentUpdate` unchanged.
- Update `mock/stop.ts` `MOCK_STOP` and any fixture to `questions: [q]`, `primary_question_index: 0`.

- [ ] **Step 1: Update the player test**

In `frontend/src/quester/screens/Stop.test.tsx`, update fixtures from `question: {…}` to `questions: [{…}], primary_question_index: 0`, and add:
```tsx
test("a bonus question renders and does not advance the stop", async () => {
  // fixture: primary A + a bonus A; answering the bonus shows feedback but stays on the stop
  // (assert the bonus prompt is visible and, after answering it, the primary gate is still shown)
});
```
Fill the bonus test with the file's existing render/stub pattern (stub `submitAnswer` to return `{ correct: true, unlocked_next: false, feedback: "Goed" }` for the bonus index; assert the stop did not advance).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- Stop && npm run typecheck`
Expected: FAIL / type errors (shape mismatch).

- [ ] **Step 3: Implement** the type edits, the player primary+bonus rendering, and the mechanical studio/mocks/draftStore adaptations until `npm test` + `npm run typecheck` are green.

- [ ] **Step 4: Run the frontend suite + typecheck**

Run: `cd frontend && npm test && npm run typecheck`
Expected: all PASS; clean; no new `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/quester frontend/src/studio
git commit -m "feat(frontend): multi-question types; player primary+bonus; studio adapt"
```

---

### Task 6: Studio — multi-question authoring UI

**Files:**
- Modify: `frontend/src/studio/screens/StopEditor.tsx` (+ `StopEditor.test.tsx`)

**Interfaces:**
- Consumes: the migrated types + `saveStopContent` (Task 5).
- Produces: authoring a list of questions with an add/remove control and a "primair (poort)" radio (selectable only for A/D); exactly one primary; save sends the full `questions` + `primary_question_index`.

Read the current `StopEditor.tsx` question-editing section first. Generalize the single-question editor into a list:
- Local state `questions: DraftQuestion[]` + `primaryIndex: number`, seeded from the active stop.
- Each question row: type select, prompt, answer (when A/D), hint, a **"primair (poort)"** radio (a row's radio is disabled unless its type `canGate`), and a remove button. An "➕ Vraag toevoegen" button appends a new blank question.
- Exactly one `primaryIndex`; if the currently-primary row's type changes to non-gating, move primary to the first gating row (or leave it — validation surfaces the block).
- Save builds the `Question[]` and sends `saveStopContent(order, { story, questions, primary_question_index: primaryIndex })`.
- "Regenereer" replaces the whole list from `StopGenerateResult`.

- [ ] **Step 1: Add the failing test**

Append to `frontend/src/studio/screens/StopEditor.test.tsx` (seed a real active stop as the other tests do):
```tsx
test("author two questions and choose the primary; save sends the list", async () => {
  // seed a stop; add a second question; the primary radio is restricted to A/D;
  // click save and assert the PUT body has questions.length === 2 and a primary_question_index.
});
```
Fill it using the file's existing seed/stub pattern; assert the `updateStopContent` fetch body via the stubbed `fetch` mock.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- StopEditor`
Expected: FAIL (no add-question / multi-question authoring yet).

- [ ] **Step 3: Implement** the multi-question authoring UI.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test -- StopEditor && npm run typecheck`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "feat(frontend): StopEditor multi-question authoring + primary radio"
```

---

### Task 7: Full verification + README

**Files:**
- Modify: `backend/README.md`, `frontend/README.md`

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: tests pass (pre-existing unhandled-rejection stderr noise is not a failure), typecheck clean, build ok. Report the test count.

- [ ] **Step 3: Update READMEs**

`backend/README.md`: note a stop now holds `questions` + `primary_question_index` (primary gates, rest bonus); `POST /trails/{id}/answer` accepts an optional `question_index` (defaults to primary); publish adds a `primary_gate` check; answer feedback is Dutch. `frontend/README.md`: note the player shows the primary gate plus a bonus-questions section, and the Stop editor authors multiple questions with a primary/gating radio. Verify against the code before writing.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md frontend/README.md
git commit -m "docs: multi-question stops (primary gates, bonus, question_index)"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3.1 model → T1; §3.2 `_build_questions` → T2; §3.3 answer flow + Dutch → T3; §3.4 validation + threading → T4; §4.1 types → T5; §4.2 player → T5; §4.3 studio → T6; §5 tests in every task; §6 out-of-scope (Stages 2–4, richer generation) respected.
- **Placeholder scan:** backend tasks give full code; the two screen tasks cite the files with precise edits and test intent + the file's existing stub pattern (the reviewer/implementer fills the RTL body against the real fixtures).
- **Type consistency:** `questions` + `primary_question_index` names identical across schemas (T1), `_build_questions`/`author_content` 3-tuple (T2), `evaluate_in_stop`/`question_index` (T3), `set_stop_content(questions=…, primary_question_index=…)`/`StopGenerateResult` (T4), and the frontend mirrors (T5–T6); the legacy-lift validator and the `primary_gate` check use the same field names.

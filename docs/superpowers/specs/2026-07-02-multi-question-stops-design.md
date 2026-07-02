# Stage 1 — Multiple questions per stop, one primary gates (design)

**Date:** 2026-07-02
**Status:** Approved design (from the atomic-model roadmap), pre-implementation
**Roadmap:** `~/.claude/plans/recursive-floating-clover.md` — Stage 1 of 4.
**Scope:** A stop carries **many** questions instead of one; exactly one is the **primary**
gating question (Type A/D) that unlocks the next stop, the rest are **bonus** (answerable,
never block). Backend model + services + answer API; player and studio UIs.

## 1. Why

The domain wants `Stop → many Question`. Today `Stop.question` / `DraftStop.question` are
single objects, `answer_service.evaluate` takes one question, and both the player
(`quester/screens/Stop.tsx:15`) and the answer endpoint (`api/trails.py:51`) assume one. This
stage makes the relationship one-to-many while preserving today's gating semantics for the
primary slot. It is additive to *content*; it introduces no identity/persistence-key change
(that is Stage 4).

## 2. Decisions (locked)

- **One primary gates, rest bonus.** A stop designates a `primary_question_index`; the primary
  must be a gateable question (Type A or D, with an answer). Bonus questions may be any type and
  **never** unlock the next stop.
- **Player stops always have a gating primary** (route generation already drops POIs without
  verifiable facts), so `Stop.primary_question_index` is required. **Draft stops may be ungated**
  (a factless/custom stop with only a reflection), so `DraftStop.primary_question_index` is
  optional; publishing still requires a gating primary (validation).
- **Back-compat, no manual migration.** Persisted `<id>.json` drafts and SQLite content rows use
  the singular `question`; a pydantic `mode="before"` validator lifts it into `questions`.
- Player answer API stays keyed on `stop_order`; a new optional `question_index` defaults to the
  primary so old clients keep working.
- UI strings Dutch; offline-safe; degrade rather than break.

## 3. Backend

### 3.1 Model (`backend/app/models/schemas.py`)

- **`Stop`**: replace `question: Question` with
  `questions: list[Question]` (min length 1) and `primary_question_index: int`.
  - `model_post_init` invariant: `questions[primary_question_index].gates is True` (primary is A/D
    with an answer); raise `ValueError` otherwise. `@property primary_question` returns it.
- **`DraftStop`**: replace `question: Question | None` with
  `questions: list[Question] = []` and `primary_question_index: int | None = None`
  (optional — authored later; validation enforces publishability).
- **`AnswerRequest`**: add `question_index: int | None = None` (None → the stop's primary).
- **`StopContentUpdate`** and **`StopGenerateResult`**: replace `question` with
  `questions: list[Question]` + `primary_question_index: int | None`.
- **Back-compat validators** — `@model_validator(mode="before")` on `Stop` and `DraftStop`: if the
  payload has a `question` key and no `questions`, set `questions = [question]`, and
  `primary_question_index = 0` when that question `gates` else `None` (drop the `question` key).
  This loads legacy drafts and cached `Stop` JSON unchanged.

Gating stays a **stop-level** property of the primary slot: a bonus question that happens to be
Type A keeps its intrinsic `gates=True`, but the answer flow only unlocks on the primary index, so
bonus questions never advance the stop.

### 3.2 Question generation (`backend/app/services/content_service.py`)

- Replace `_build_question(poi) -> Question` with
  `_build_questions(poi) -> tuple[list[Question], int | None]`:
  - Build one **Type-A** data-bound question for **each** fact whose key is in
    `_DATA_BOUND_TEMPLATES` (bounded by the template set, ≤5), in fact order.
  - Append one **Type-C** reflection question ("Kijk eens rond bij {name}…") as a bonus.
  - If at least one data-bound question exists → `primary_index = 0` (the first A). Otherwise the
    list is `[reflection]` and `primary_index = None` (ungated — only reachable for factless POIs).
- `build_stop(poi, theme, order)` and `author_content(poi, theme, tone)` return the list + primary
  index and construct `Stop(..., questions=..., primary_question_index=...)`.
  `author_content` returns `(story, questions, primary_index)`.

### 3.3 Answer flow

- `answer_service`: add
  `evaluate_in_stop(stop, question_index, submitted, attempt) -> AnswerResult`:
  - resolve `idx = question_index if not None else (stop.primary_question_index or 0)`;
  - if `idx == stop.primary_question_index` → delegate to `evaluate(stop.questions[idx], …)` (the
    existing per-type gating);
  - else (a **bonus** question) → `evaluate(...)` for correctness/feedback but return it with
    `unlocked_next=False` (bonus never advances).
- **Translate the `answer_service.evaluate` feedback strings to Dutch** (they are the last
  English player-facing copy): "Correct! On to the next stop." → "Correct! Door naar de volgende
  stop."; the reflection line → "Bedankt voor het delen — hier is geen fout antwoord."; the
  observe/count line → "Goed gespot! (We vertrouwen je telling hier.)"; the reveal line →
  "Het antwoord was: {answer}. We gaan verder."; "Not quite." → "Net niet."; the hint variant →
  "Net niet. Tip: {hint}". Update any test asserting the old English strings.
- `backend/app/api/trails.py` `submit_answer`: resolve the stop by `stop_order`; bounds-check the
  resolved index (→ 404 on out-of-range); call `evaluate_in_stop`.

### 3.4 Validation (`backend/app/services/draft_service.py`)

- The `content` check keeps "every stop has a story". Add a new **`primary_gate`** blocking check:
  every stop has `primary_question_index is not None` and `questions[primary].gates`. A stop with
  no gating primary blocks publish (consistent with the existing factless-blocks-publish rule).
- `set_stop_content` / `generate_stop_content` thread `questions` + `primary_question_index`.

## 4. Frontend

### 4.1 Types (`frontend/src/api/types.ts`)

`Stop`/`DraftStop`: `question` → `questions: Question[]` + `primary_question_index`
(`number` for `Stop`, `number | null` for `DraftStop`). `AnswerRequest` + `question_index?: number`.
`StopContentUpdate`/`StopGenerateResult` mirror the backend.

### 4.2 Player (`frontend/src/quester/screens/Stop.tsx`)

- The **primary** question drives the existing gate/lock UI (unchanged behavior: attempts, hint,
  reveal-after-max, advance on `unlocked_next`); `handleSubmit` passes
  `question_index = primary_question_index`.
- Render **bonus** questions below in an "Extra vragen" section: each has its own answer input +
  submit + feedback/reveal, but no lock and no advance (they submit with their own
  `question_index` and ignore `unlocked_next`). Points logic still keys off the primary solve.

### 4.3 Studio (`frontend/src/studio/screens/StopEditor.tsx`)

- Author a **list** of questions (add/remove), each with type/prompt/answer/hint (reuse the
  existing per-question editor + `canGate`). A **"primair (poort)"** radio selects the primary;
  it is selectable only for A/D questions and exactly one may be primary. Generalize
  `buildQuestionWith`/`saveQuestionWith` to build the list; save via `StopContentUpdate`.
  "Regenereer" now populates the whole list + primary from `StopGenerateResult`.

## 5. Testing

**Backend (pytest, offline):**
- `Stop` invariant (primary must gate; raises otherwise); `Stop`/`DraftStop` `mode="before"`
  validator lifts a legacy singular `question` (checked-in legacy JSON fixture).
- `_build_questions`: a multi-fact POI yields several Type-A + a reflection with primary 0; a
  factless POI yields `[reflection]`, primary `None`.
- `evaluate_in_stop`: the primary gates per type; a bonus question returns `unlocked_next=False`
  even when correct/pass-through.
- `evaluate` feedback is Dutch (assert the Dutch correct/reveal/reflection strings).
- `/trails/{id}/answer`: answering the primary unlocks; answering a bonus does not; out-of-range
  index → 404; omitted `question_index` targets the primary.
- `draft_service.validate`: a stop with no gating primary trips the `primary_gate` blocking check;
  a stop with a valid primary passes.

**Frontend (Vitest + RTL, mocked fetch):**
- `quester/screens/Stop.test.tsx`: the primary gates (advances on unlock); a bonus question renders,
  accepts an answer, and does **not** advance.
- `studio/screens/StopEditor.test.tsx`: author two questions, pick the primary (radio restricted to
  A/D), save sends `questions` + `primary_question_index`; Regenereer populates the list.
- Player + studio existing suites stay green (updated for the `questions` shape).

## 6. Out of scope / follow-ups

- Stages 2–4 (desired-stop-count, creator grounding, stop identity/hydration).
- Richer question generation (difficulty, per-fact riddles) beyond the data-bound + reflection MVP.

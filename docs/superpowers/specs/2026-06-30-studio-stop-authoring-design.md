# Trail Creator — Stop-editor content authoring (design)

**Date:** 2026-06-30
**Status:** Approved design, pre-implementation
**Scope:** Make the studio Stop editor fully working — edit + persist a stop's story and
question, and regenerate a grounded story (+ candidate question) from the selected facts —
spanning two new backend endpoints and the frontend Stop editor. Builds on the merged
studio-route-creation feature (drafts, `DraftStop`, the draft store).

## 1. Goal

Turn `/studio/stop` from a mock-seeded read-mostly view into a working content authoring tool:

- The Verhaal (story) and Opdracht (question) load from the **active draft stop** and are
  **editable and persisted** to the draft (`DraftStop.story` / `DraftStop.question`).
- **"Regenereer"** generates a grounded story (+ a candidate question) from **only the selected
  facts** — invents nothing (PRD §8). Works offline via the stub provider so tests are
  deterministic.
- A **tone** selector steers generation.
- Edits **autosave** (no manual save step). The player preview reflects live story + question.

The content-accuracy contract is enforced on both sides: facts stay locked ground truth; only
Type-A/D questions (with a verified answer) may gate.

## 2. Decisions (locked)

- **Two new draft-scoped backend endpoints** (not an overload of `PUT /drafts/{id}`):
  `PUT /drafts/{id}/stops/{order}` (save content) and `POST /drafts/{id}/stops/{order}/generate`
  (RAG generation, no auto-save).
- **No-cache authoring generation:** `content_service.author_content` is a fresh, fact-filtered
  variant of `build_stop` — it does NOT read/write the `(POI×theme)` cache.
- **`Question` model is the gate** server-side: an A/D question without an answer is rejected
  (422); a B question can never gate. The UI mirrors this.
- **Autosave on blur** for text fields; **immediate** save for discrete controls (type, gate) and
  after a successful Regenereer. (Blur-save is deterministic to test and not chatty.)
- Backend changes in scope (the `Question` invariants already live in `schemas.py`).
- UI strings remain Dutch. Offline-safe throughout (stub generation + seed POIs).

## 3. Scope boundary

**In this iteration:**
- Backend: `content_service.author_content`; a `tone` param on `LLMProvider.rephrase`;
  `draft_service.set_stop_content` + `generate_stop_content`; routers
  `PUT /drafts/{id}/stops/{order}` and `POST /drafts/{id}/stops/{order}/generate`.
- Frontend: `api/drafts` gains `updateStopContent` + `generateStopContent`; the draft store gains
  `saveStopContent` + `generateStopContent`; the StopEditor loads/edits/persists story + question,
  wires real Regenereer + tone, and the player preview reflects edits.

**Deferred (fast-follows, NOT here):**
- Validation screen reading real grounding; publish → moderation.
- Per-fact binding of a Type-A answer to a specific fact value (MVP requires a non-empty answer for
  A/D; deeper grounding is a curation/validation concern).
- Multi-stop "prev/next" navigation inside the Stop editor; image/media; undo history.

## 4. Backend

### 4.1 `LLMProvider.rephrase` — add `tone`

`backend/app/services/llm/provider.py`: add `tone: str | None = None` to `LLMProvider.rephrase`
and `StubProvider.rephrase` (Stub ignores it), and thread it into `_build_prompt` so real
providers include the requested tone in the instruction. Backward-compatible (default `None`).

### 4.2 `content_service.author_content`

```
author_content(poi: POI, theme: Theme, tone: str | None = None) -> tuple[str, Question]
```
A no-cache authoring variant of `build_stop`: `question = _build_question(poi)`;
`story = get_llm_provider().rephrase(poi_name=poi.name, theme=theme, facts=poi.facts,
background=poi.background, tone=tone)` with the same `RuntimeError` → `StubProvider` fallback
(degrade rather than break, PRD §13). It does NOT touch `content_cache`. The caller controls which
facts are in `poi.facts` (the selected subset), so generation is scoped to ground truth the creator
chose.

### 4.3 `draft_service` — content functions

- `set_stop_content(draft_id, order, *, story=None, question=None) -> DraftTrail | None`: load the
  draft; find the stop by `order` (None → 404 at API); set `story` and/or `question` on that
  `DraftStop`; re-derive the draft `attributions` from all stops' locked `poi.facts` (the
  include/exclude selection scopes *generation* only — the locked facts remain the source set);
  persist; return the draft. Passing an invalid `Question` (e.g. Type-A with no
  answer) raises `ValueError` from the model → 422 at the API.
- `generate_stop_content(draft_id, order, *, fact_keys=None, tone=None) -> tuple[str, Question] | None`:
  load the draft + stop (None → 404); build a filtered `POI` copy whose `facts` are those whose
  `key ∈ fact_keys` (or all facts when `fact_keys is None`); call
  `content_service.author_content(filtered_poi, draft.theme, tone)`; return `(story, question)`.
  Does **not** persist (the creator reviews/edits, then the client autosaves).

### 4.4 Schemas

Request bodies in `schemas.py`:
```
StopContentUpdate:    story: str | None = None; question: Question | None = None
StopGenerateRequest:  fact_keys: list[str] | None = None; tone: str | None = None
StopGenerateResult:   story: str; question: Question
```

### 4.5 Routers

`backend/app/api/drafts.py` (same router as the existing draft CRUD):
- `PUT /drafts/{id}/stops/{order}` body `StopContentUpdate` → `draft_service.set_stop_content`;
  404 if the draft or stop order is unknown; the `Question` `ValueError` surfaces as 422 (a small
  try/except mapping `ValueError` → `HTTPException(422)`).
- `POST /drafts/{id}/stops/{order}/generate` body `StopGenerateRequest` →
  `draft_service.generate_stop_content` → `StopGenerateResult`; 404 if unknown.

Degrade rather than break: generation falls back to the stub; unknown ids 404.

## 5. Frontend

### 5.1 API layer

`frontend/src/api/types.ts` adds `StopContentUpdate`, `StopGenerateRequest`, `StopGenerateResult`.
`frontend/src/api/drafts.ts` adds:
- `updateStopContent(draftId, order, body: StopContentUpdate) -> DraftTrail`
- `generateStopContent(draftId, order, body: StopGenerateRequest) -> StopGenerateResult`

### 5.2 Draft store

`studio/draftStore.tsx` gains:
- `saveStopContent(order, { story?, question? }) -> Promise<void>` → `updateStopContent` then
  replace `draft` with the server copy (authoritative attributions).
- `generateStopContent(order, { fact_keys?, tone? }) -> Promise<StopGenerateResult>` → returns the
  generated content to the caller (no state change here; the StopEditor fills its fields then
  calls `saveStopContent`).

### 5.3 StopEditor (the heart)

- Load story + question from the active `DraftStop` (`draft.stops.find(s => s.order ===
  activeStopOrder)`). When content is `null` (a new stop), the fields start empty and a prominent
  **"Genereer met AI"** CTA is shown. The `MOCK_STOP` fallback remains only for the no-active-draft
  deep-link case.
- **Verhaal:** editable textarea, autosaves on blur via `saveStopContent(order, { story })`.
- **Opdracht (now editable):** prompt input, answer input (rendered and **required** when type is
  A/D), hint input, the existing type `<select>` + gate toggle. `canGate` keeps the gate toggle
  disabled for B/C. On change of a text field → blur autosave; type/gate change → immediate
  autosave, building a `question` object `{ type, prompt, answer?, hint?, gates }`. The client
  blocks saving an A/D question with an empty answer (mirrors the 422) and shows an inline hint.
- **"Regenereer":** `generateStopContent(order, { fact_keys: <checked fact keys>, tone })` → fill
  the story + question fields → autosave. Wire the existing fact include/exclude checkboxes to
  produce `fact_keys`.
- **Tone:** a "Toon ▾" `<select>` (Speels / Zakelijk / Kindvriendelijk / Verhalend) → state, passed
  to generate.
- A small status indicator ("Bezig…" / "Opgeslagen ✓") reflects save state.
- Player preview reflects the live story and question prompt.

## 6. Data flow

```
StopEditor mount ─▶ read active DraftStop story/question (or empty + "Genereer" CTA)
edit story/prompt/answer/hint ─blur─▶ store.saveStopContent ─▶ PUT /drafts/{id}/stops/{order} ─▶ replace draft
change type/gate ─▶ store.saveStopContent (immediate)
"Regenereer" ─▶ store.generateStopContent(fact_keys, tone) ─POST .../generate─▶ {story,question}
            └─▶ fill fields ─▶ store.saveStopContent
```

## 7. Content-accuracy guardrails

- Generation runs **server-side over only the selected facts** — the client sends `fact_keys`, the
  server filters the POI before `rephrase`; the LLM rephrases ground truth and invents nothing.
- Facts remain **locked** (display + include/exclude only; never free-text editable).
- The **`Question` model** rejects a gating question without an answer (422) and a gating Type-B;
  the UI enforces the same so the creator gets immediate feedback.
- Attributions are re-derived on save from the stop's included facts.

## 8. Testing

**Backend (pytest, offline stub):**
- `rephrase` accepts `tone` (signature + stub ignores it; real prompt includes it).
- `author_content` grounds the story in the passed facts and degrades to the stub; does not touch
  the content cache.
- `generate_stop_content` filters by `fact_keys` (a fact key not selected does not appear);
  `set_stop_content` persists story + question; setting a Type-A question with no answer → the
  endpoint returns 422; unknown draft/stop → 404.
- The two endpoints round-trip (generate → set → get reflects the saved content).

**Frontend (Vitest + RTL, mocked fetch):**
- `updateStopContent`/`generateStopContent` client request shapes + `ApiError` on non-2xx.
- store `saveStopContent` replaces the draft; `generateStopContent` returns the generated content.
- StopEditor: loads the active stop's story/question; editing the story + blur calls the PUT;
  "Regenereer" calls generate and fills the fields; an A/D question with an empty answer is blocked
  from saving (inline message); the existing `canGate`/word-count/gate-toggle tests stay green.

Existing player + studio suites stay green; offline-safe throughout.

## 9. Out of scope

Validation-screen grounding, publish/moderation, per-fact answer binding, in-editor prev/next stop
navigation, media, undo. Each leaves a clean seam (the `DraftStop` content fields, the two
endpoints, and the store actions) to extend later.

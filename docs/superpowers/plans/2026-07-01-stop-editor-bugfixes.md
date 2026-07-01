# Stop-Editor Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the StopEditor so generate/save work on the real active stop (no silent MOCK_STOP no-op), the location reflects the real stop, generated content is Dutch, and a stalled `claude_cli` generate fails fast instead of spinning forever.

**Architecture:** Backend translates the generated content (question templates/hint/reflection + story system prompt) to Dutch. Frontend adds an `apiFetch` timeout (AbortController) used by the generate client, and reworks the StopEditor to require a real active stop (removing the editable `MOCK_STOP` fallback) with the location sourced from that stop.

**Tech Stack:** Python/FastAPI/pytest (backend); Vite + React + TypeScript + Vitest + RTL (frontend).

## Source-of-truth convention

Backend + frontend-logic tasks give full code. The StopEditor rework (Task 3) modifies an existing file — the plan cites it and specifies exact edits, and gives full test code. Read the current file before editing.

Backend runs from `backend/` after `source .venv/bin/activate`. Frontend from `frontend/` with `npm test`.

## Global Constraints

- **All generated content Dutch** (question templates, hint, reflection, factless-story fallback, story system prompt + prompt labels). Only phrasing changes — `Question.type`/`answer`/gating are unchanged.
- **Require a real active stop:** the StopEditor renders editable fields + Regenereer/save buttons only when `activeStop` exists; otherwise a "Geen stop geselecteerd" message. Remove the editable `MOCK_STOP` fallback.
- **Location from the real stop:** coords from `activeStop.poi.location`; address = `draft.city`.
- **`apiFetch` timeout:** optional `timeoutMs` via AbortController → `ApiError(408, "Verzoek duurde te lang")`; the generate client uses 90000 ms.
- Offline-safe; backend CI green (`ruff check`, `ruff format --check`, `mypy app`, `pytest`); UI strings Dutch; no `window.confirm/alert/prompt`.
- Frontend: existing player + studio suites stay green; `npm run typecheck` clean; no new `act(...)` warnings.
- A pre-existing Starlette/httpx `StarletteDeprecationWarning` and the pre-existing "Body has already been read" unhandled-rejection stderr noise are not failures — ignore them.

---

### Task 1: Backend — Dutch generated content

**Files:**
- Modify: `backend/app/services/content_service.py` (templates, hint, reflection)
- Modify: `backend/app/services/llm/provider.py` (factless line, system prompt, `_build_prompt` labels)
- Modify: `backend/tests/test_llm_provider.py` (the one English assertion)
- Test: `backend/tests/test_dutch_content.py`

**Interfaces:**
- Produces: Dutch output from `content_service._build_question` and `LLMProvider`/`StubProvider.rephrase` (factless case). Signatures unchanged.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_dutch_content.py`:
```python
from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense, Theme
from app.services.content_service import _build_question
from app.services.llm.provider import StubProvider


def _poi(*, facts: bool) -> POI:
    fs = (
        [Fact(key="height_m", value="78", source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"))]
        if facts
        else []
    )
    return POI(id="p1", name="Sint-Bavokerk", location=GeoPoint(lat=52.38, lon=4.63), facts=fs)


def test_data_bound_question_is_dutch():
    q = _build_question(_poi(facts=True))
    assert q.type == "A"
    assert q.answer == "78"
    assert "Hoe hoog" in q.prompt  # Dutch template
    assert q.hint is not None and "hoogte" in q.hint


def test_reflection_question_is_dutch():
    q = _build_question(_poi(facts=False))
    assert q.type == "C"
    assert "Kijk eens rond" in q.prompt


def test_stub_factless_story_is_dutch():
    story = StubProvider().rephrase(poi_name="Plein", theme=Theme.MIXED, facts=[])
    assert story == "Plein is onderdeel van je speurtocht."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_dutch_content.py -q`
Expected: FAIL (English strings present).

- [ ] **Step 3: Translate the question builder**

In `backend/app/services/content_service.py`, replace the `_DATA_BOUND_TEMPLATES` dict and add a hint-label map:
```python
_DATA_BOUND_TEMPLATES: dict[str, str] = {
    "height_m": "Hoe hoog is {name}, in meters?",
    "build_year": "In welk jaar is {name} gebouwd?",
    "build_year_start": "In welk jaar begon de bouw van {name}?",
    "founded_year": "In welk jaar is {name} opgericht?",
    "architect": "Wie was de architect van {name}?",
}

_HINT_LABELS: dict[str, str] = {
    "height_m": "hoogte",
    "build_year": "bouwjaar",
    "build_year_start": "bouwjaar",
    "founded_year": "oprichtingsjaar",
    "architect": "architect",
}
```
In `_build_question`, change the hint line and the reflection prompt:
```python
            return Question(
                type=QuestionType.DATA_BOUND,
                prompt=template.format(name=poi.name),
                answer=fact.value,
                hint=f"Tip: het gaat over de {_HINT_LABELS.get(fact.key, fact.key.replace('_', ' '))}.",
            )
    # No data-bound fact available → open reflection (never gates on correctness).
    return Question(
        type=QuestionType.OPEN_REFLECTION,
        prompt=f"Kijk eens rond bij {poi.name}. Wat denk je dat hier vroeger is gebeurd?",
    )
```

- [ ] **Step 4: Translate the LLM prompt + factless line**

In `backend/app/services/llm/provider.py`:

Replace `_SYSTEM_PROMPT`:
```python
_SYSTEM_PROMPT = (
    "Je bent een lokale gids die een korte, levendige stopbeschrijving schrijft voor een "
    "wandelspeurtocht. Je krijgt een plaatsnaam, een thema, een lijst geverifieerde feiten en "
    "eventueel wat achtergrond. Gebruik voor elk verifieerbaar detail (data, getallen, namen) "
    "UITSLUITEND de geverifieerde feiten — verzin niets en laat weg wat niet gegeven is. Je mag "
    "de achtergrond parafraseren voor kleur, maar nooit letterlijk overnemen en nooit als bron "
    "van nieuwe feiten gebruiken. Houd het op 2-3 zinnen en sluit aan bij de toon van het thema. "
    "Schrijf in het Nederlands."
)
```

Replace `_build_prompt` body's labels + final line:
```python
def _build_prompt(
    poi_name: str, theme: Theme, facts: list[Fact], background: str | None, tone: str | None = None
) -> str:
    fact_lines = "\n".join(f"- {f.key.replace('_', ' ')}: {f.value}" for f in facts)
    prompt = (
        f"Plaats: {poi_name}\n"
        f"Thema: {theme.value}\n"
        f"Geverifieerde feiten (gebruik alleen deze voor verifieerbare claims):\n{fact_lines}\n"
    )
    if background:
        prompt += (
            f"\nAchtergrond om te parafraseren (niet kopiëren, geen nieuwe feiten):\n{background}\n"
        )
    if tone:
        prompt += f"\nToon: schrijf in een {tone} toon.\n"
    return prompt + "\nSchrijf nu de stopbeschrijving."
```

Change the factless fallback in BOTH `LLMProvider.rephrase` and `StubProvider.rephrase` from
`f"{poi_name} is part of your trail."` to:
```python
        if not facts and not background:  # (LLMProvider.rephrase)
            return f"{poi_name} is onderdeel van je speurtocht."
```
```python
        if not facts:  # (StubProvider.rephrase)
            return f"{poi_name} is onderdeel van je speurtocht."
```

- [ ] **Step 5: Fix the one existing English assertion**

In `backend/tests/test_llm_provider.py`, change the assertion at ~line 56 from
`assert story == "Square is part of your trail."` to
`assert story == "Square is onderdeel van je speurtocht."`.

- [ ] **Step 6: Run the full backend gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. If `ruff format --check .` flags files, run `ruff format .` and include it.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/content_service.py backend/app/services/llm/provider.py backend/tests/test_llm_provider.py backend/tests/test_dutch_content.py
git commit -m "feat(backend): Dutch generated content (questions, hints, story prompt)"
```

---

### Task 2: Frontend — `apiFetch` timeout

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/drafts.ts` (generate client uses the timeout)
- Test: `frontend/src/api/client.test.ts` (new)

**Interfaces:**
- Produces: `apiFetch<T>(path, init?, opts?: { timeoutMs?: number })` — aborts after `timeoutMs` and throws `ApiError(408, "Verzoek duurde te lang")`. `generateStopContent` passes `{ timeoutMs: 90000 }`.

- [ ] **Step 1: Write the failing test**

`frontend/src/api/client.test.ts`:
```ts
import { afterEach, expect, test, vi } from "vitest";
import { apiFetch } from "./client";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test("apiFetch times out and throws ApiError 408", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  );
  const p = apiFetch("/slow", undefined, { timeoutMs: 50 });
  const assertion = expect(p).rejects.toMatchObject({ name: "ApiError", status: 408 });
  await vi.advanceTimersByTimeAsync(60);
  await assertion;
});

test("apiFetch without timeoutMs works normally", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
  await expect(apiFetch("/x")).resolves.toEqual({ ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- client`
Expected: FAIL (`apiFetch` ignores the third arg; no 408).

- [ ] **Step 3: Implement the timeout in `client.ts`**

Replace the `apiFetch` function in `frontend/src/api/client.ts`:
```ts
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const controller = opts?.timeoutMs != null ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), opts!.timeoutMs) : undefined;
  const fetchInit: RequestInit = { headers: { "Content-Type": "application/json" }, ...init };
  if (controller) fetchInit.signal = controller.signal;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, fetchInit);
  } catch (err) {
    if (controller?.signal.aborted) throw new ApiError(408, "Verzoek duurde te lang");
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Give the generate client a 90 s timeout**

In `frontend/src/api/drafts.ts`, change `generateStopContent` to pass the timeout:
```ts
export const generateStopContent = (draftId: string, order: number, body: StopGenerateRequest) =>
  apiFetch<StopGenerateResult>(`/drafts/${draftId}/stops/${order}/generate`, {
    method: "POST",
    body: JSON.stringify(body),
  }, { timeoutMs: 90000 });
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npm test -- client drafts && npm run typecheck`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/drafts.ts frontend/src/api/client.test.ts
git commit -m "feat(frontend): apiFetch timeout; generate call aborts after 90s"
```

---

### Task 3: StopEditor — require a real active stop; real location

**Files:**
- Modify: `frontend/src/studio/screens/StopEditor.tsx`
- Modify: `frontend/src/studio/screens/StopEditor.test.tsx` (add cases; update MOCK_STOP-reliant ones)

**Interfaces:**
- Consumes: `useDraft()` (`draft`, `activeStopOrder`, …); the timeout is already inside the generate client (Task 2).
- Produces: an editor that renders its content only for a real `activeStop`, with the location from that stop.

Read the current `frontend/src/studio/screens/StopEditor.tsx` first. Changes:

1. **Gate the editor on `activeStop`.** Keep all hooks (they must run unconditionally). Compute
   `const activeStop = draft?.stops.find((s) => s.order === activeStopOrder);` and
   `const hasStop = activeStop !== undefined;`. The center editor panel + the right player-preview panel
   render their real content **only when `hasStop`**; when `!hasStop`, render a single centered message
   in the editor area: "Geen stop geselecteerd — kies een stop in de route-editor" (and no Verhaal/Opdracht
   fields, no Regenereer button, no save controls). Remove the editable `MOCK_STOP` fallback for
   `activePoi`/`sourceStory`/`sourceQuestion`: derive them from `activeStop` only (e.g.
   `const activePoi = activeStop?.poi;` and guard the render on `hasStop`, so `activePoi` is always defined
   inside the rendered branch). The `MOCK_STOP` import may be removed if no longer referenced.
2. **Location from the real stop.** In the left sidebar, change the address line from the hardcoded
   `"Grote Markt 22, Haarlem"` to `{draft?.city}` and the coordinates line from `stop.poi.location.…` to
   `activeStop.poi.location.lat.toFixed(4)` / `.lon.toFixed(4)` (inside the `hasStop` branch).
3. **Regenereer error copy.** Where the Regenereer error renders (`regenError`), use the message
   "Genereren mislukt of duurde te lang — probeer opnieuw." (covers the new 408 timeout from Task 2).

Because the editor now requires an active stop, any existing test that rendered StopEditor **without**
seeding an active stop (relying on the `MOCK_STOP` fallback) must be updated to seed one. Those are the
"selecting type B disables the gate toggle" and "verhaal word count" tests. Update them to render with a
`Seed` component that calls `createDraft` then `setActiveStop(1)` (the same pattern the other StopEditor
tests already use), with `fetch` stubbed to return a one-stop draft whose stop 1 has a POI + `story` +
`question` so the fields render. (The pure `canGate` unit test does not render and needs no change.)

- [ ] **Step 1: Add the new failing tests**

Append to `frontend/src/studio/screens/StopEditor.test.tsx` (ensure `vi`, `MemoryRouter`, `DraftProvider`, `useDraft`, `render`, `screen` imports exist):
```tsx
test("with no active stop, shows the hint and no Regenereer button", async () => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
  render(<MemoryRouter><DraftProvider><StopEditor /></DraftProvider></MemoryRouter>);
  expect(await screen.findByText(/Geen stop geselecteerd/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Regenereer|Genereren/i })).toBeNull();
});

test("the location shows the active stop's real coordinates, not Haarlem/mock", async () => {
  const draftWithStop = {
    id: "d1", title: "t", city: "Amsterdam", theme: "historical",
    start: { lat: 52.37, lon: 4.90 }, requested_distance_km: 5, actual_distance_km: 1,
    estimated_duration_min: 10,
    stops: [{ order: 1, poi: { id: "p1", name: "Waag", location: { lat: 52.3728, lon: 4.9036 }, facts: [] }, story: "s", question: null }],
    status: "concept", attributions: [],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(draftWithStop), { status: 201 })));
  function Seed() {
    const { setActiveStop, createDraft } = useDraft();
    return <button onClick={async () => { await createDraft({ start: { lat: 52.37, lon: 4.90 } }); setActiveStop(1); }}>seed</button>;
  }
  render(<MemoryRouter><DraftProvider><Seed /><StopEditor /></DraftProvider></MemoryRouter>);
  await userEvent.click(screen.getByText("seed"));
  expect(await screen.findByText(/52\.3728/)).toBeInTheDocument();   // real lat, not the mock
  expect(screen.getByText(/Amsterdam/)).toBeInTheDocument();          // draft city, not "Grote Markt 22, Haarlem"
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- StopEditor`
Expected: FAIL (mock coords/address still shown; Regenereer button present with no active stop).

- [ ] **Step 3: Implement** the StopEditor changes (gate on `activeStop`, real location, error copy), and update the two MOCK_STOP-reliant tests to seed an active stop.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd frontend && npm test -- StopEditor && npm run typecheck`
Expected: PASS; clean. No new `act(...)` warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/studio/screens/StopEditor.tsx frontend/src/studio/screens/StopEditor.test.tsx
git commit -m "fix(frontend): StopEditor requires a real active stop; real location, no MOCK fallback"
```

---

### Task 4: Full verification + README

**Files:**
- Modify: `frontend/README.md`

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Backend full gate**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check . && ruff format --check . && mypy app`
Expected: all PASS/clean. Report the pytest count.

- [ ] **Step 2: Frontend full gate**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all tests pass (the pre-existing "Body has already been read" stderr noise is not a failure), typecheck clean, build succeeds. Report the test count.

- [ ] **Step 3: Update README**

In `frontend/README.md`, add a short note under the studio section: generated content (stories + questions) is now Dutch; the Stop editor requires a selected stop (it no longer shows a placeholder stop) and shows that stop's real coordinates + the draft city; and "Regenereer" times out after ~90 s (use `TRAILQUEST_LLM_PROVIDER=stub` for fast local generation instead of the slow `claude_cli`).

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md
git commit -m "docs: Dutch content, StopEditor active-stop requirement, generate timeout"
```

---

## Self-review (completed during planning)

- **Spec coverage:** §3 Dutch content → T1; §4.1 apiFetch timeout → T2; §4.2 StopEditor (active-stop gate, real location, error copy) → T3; §5 testing → tests in every task; §6 out-of-scope respected (no claude_cli speedup, no address lookup, no re-translation of persisted drafts).
- **Placeholder scan:** T1/T2 give full code; T3 cites the file with exact edits + full new test code + explicit instruction to update the two MOCK_STOP-reliant tests.
- **Type consistency:** the `apiFetch(path, init?, opts?: { timeoutMs })` signature (T2) is consumed by `generateStopContent` (T2) exactly; `ApiError(408, …)` matches the existing `ApiError` shape; the StopEditor consumes `useDraft()`/`activeStopOrder`/`draft.city`/`activeStop.poi.location` as they exist; the Dutch strings asserted in T1 tests match the strings implemented in T1 steps 3–4; the one pre-existing English assertion is updated in T1 step 5.

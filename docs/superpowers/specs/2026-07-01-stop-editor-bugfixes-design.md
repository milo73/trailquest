# Stop-editor bug fixes (design)

**Date:** 2026-07-01
**Status:** Approved design, pre-implementation
**Scope:** Fix three reported StopEditor problems — the generate/save calls silently no-op (the editor
falls back to a fake `MOCK_STOP`), the location always shows Haarlem, and generated questions are in
English — plus the underlying "Regenereer spins forever" (no client timeout on a slow `claude_cli`
backend). Backend (Dutch content) + frontend (StopEditor + apiFetch timeout).

## 1. Root causes (verified in code)

1. **Silent no-op / fake stop.** `StopEditor.tsx` renders an editable `MOCK_STOP` fallback (Sint-Bavokerk,
   hardcoded "Grote Markt 22, Haarlem") whenever there is no real active stop, and
   `handleRegenerate`/`saveStory`/`saveQuestion` all begin with `if (activeStopOrder === undefined) return`
   — so on the fallback, the buttons do nothing (no request, no error). This is the "generate call not
   happening at all."
2. **Location always Haarlem.** The sidebar hardcodes the address `"Grote Markt 22, Haarlem"` and reads the
   coordinates from `MOCK_STOP` (`stop.poi.location`), not the active stop.
3. **English questions.** `content_service._DATA_BOUND_TEMPLATES`, the hint, and the reflection question are
   English; the story `_SYSTEM_PROMPT` + `_build_prompt` labels are English too (so generated stories are
   English). This is the same pipeline the player uses.
4. **Regenereer spins forever.** The `claude_cli` provider blocks up to `http_timeout × 4` (= 480 s with the
   current `.env`), and `apiFetch` has no timeout, so a slow/stalled generation spins with no result.

## 2. Decisions (locked)

- **Require a real active stop.** The StopEditor renders its editable content + Regenereer/save buttons only
  when a real `activeStop` exists; otherwise it shows "Geen stop geselecteerd — kies een stop in de
  route-editor". The editable `MOCK_STOP` fallback is removed. This makes the silent no-op impossible (the
  buttons only exist for a real stop) and is the primary fix.
- **Location from the real stop:** coordinates from `activeStop.poi.location`; the address line shows the
  draft's city (`draft.city`) instead of the hardcoded street address.
- **All generated content Dutch:** question templates, hint, reflection, the factless-story fallback, and the
  story system prompt + prompt labels.
- **Client timeout:** `apiFetch` gains an optional timeout (AbortController); the generate client uses ~90 s;
  on timeout the StopEditor shows a clear Dutch message. (For fast local generation, use
  `TRAILQUEST_LLM_PROVIDER=stub` — noted in the README, not changed here.)
- UI strings Dutch; offline-safe; no `window.confirm/alert/prompt`.

## 3. Backend — Dutch generated content

`backend/app/services/content_service.py`:
- `_DATA_BOUND_TEMPLATES` → Dutch: `height_m` "Hoe hoog is {name}, in meters?"; `build_year` "In welk jaar
  is {name} gebouwd?"; `build_year_start` "In welk jaar begon de bouw van {name}?"; `founded_year` "In welk
  jaar is {name} opgericht?"; `architect` "Wie was de architect van {name}?".
- Hint → Dutch via a small key→label map (`height_m`→"hoogte", `build_year`/`build_year_start`→"bouwjaar",
  `founded_year`→"oprichtingsjaar", `architect`→"architect"): `hint = f"Tip: het gaat over de {label}."`
  (fallback to the humanized key).
- Reflection question → Dutch: `"Kijk eens rond bij {name}. Wat denk je dat hier vroeger is gebeurd?"`

`backend/app/services/llm/provider.py`:
- The factless fallback in `LLMProvider.rephrase` and `StubProvider.rephrase`:
  `f"{poi_name} is onderdeel van je speurtocht."` (was "… is part of your trail.").
- `_SYSTEM_PROMPT` → a Dutch instruction (same content-accuracy rules: use only the verified facts, invent
  nothing, 2–3 sentences, match the theme's tone — in Dutch).
- `_build_prompt` labels → Dutch ("Plaats:", "Thema:", "Geverifieerde feiten (gebruik alleen deze voor
  verifieerbare claims):", "Achtergrond om te parafraseren (niet kopiëren, geen nieuwe feiten):",
  "Schrijf nu de stopbeschrijving.", "Toon: schrijf in een {tone} toon.").

The `Question` model/gating and the answer values are unchanged — only phrasing is translated, so the
retrieved/generated contract and the tests that assert `type`/`answer` still hold.

## 4. Frontend

### 4.1 `apiFetch` timeout (`api/client.ts`)

Add an optional third arg: `apiFetch<T>(path, init?, opts?: { timeoutMs?: number })`. When `timeoutMs` is set,
use an `AbortController` + `setTimeout(controller.abort, timeoutMs)` (cleared in a `finally`), pass the
`signal` to `fetch`, and translate an abort into `ApiError(408, "Verzoek duurde te lang")`.

`api/drafts.ts`: `generateStopContent` passes `{ timeoutMs: 90000 }` so a stalled generation fails after 90 s.

### 4.2 StopEditor (`studio/screens/StopEditor.tsx`)

- Compute `activeStop = draft?.stops.find(s => s.order === activeStopOrder)`. When there is **no** `activeStop`,
  render the "Geen stop geselecteerd — kies een stop in de route-editor" message in the editor body and do
  **not** render the editable fields or the Regenereer/save buttons. Remove the editable `MOCK_STOP`
  fallback. (Hooks still run unconditionally — only the JSX is gated.)
- With a real `activeStop`: the header/preview name, the locked facts, the coordinates line
  (`activeStop.poi.location.lat/lon`), and the address (`draft.city`) all come from the real stop.
- The Regenereer error message covers the timeout case: "Genereren mislukt of duurde te lang — probeer
  opnieuw."

## 5. Testing

**Backend (pytest, offline):**
- `content_service._build_question` for a `height_m` POI returns a Dutch prompt (contains "Hoe hoog") with the
  fact value as the answer; a POI with no data-bound fact returns the Dutch reflection ("Kijk eens rond").
- `StubProvider.rephrase` with no facts returns the Dutch factless line ("onderdeel van je speurtocht").
- Update any existing test that asserted the old English strings (assert the Dutch equivalents or the
  language-neutral `type`/`answer`).

**Frontend (Vitest + RTL, mocked fetch):**
- `apiFetch` aborts and throws `ApiError` (status 408) when the response exceeds `timeoutMs` (use fake timers
  or a never-resolving fetch + advance).
- StopEditor: with no active stop → shows "Geen stop geselecteerd" and no Regenereer button; with a real
  active stop whose coords differ from Haarlem → the coordinates line shows the real coords (not the mock).
- Existing StopEditor tests that rendered against `MOCK_STOP` are updated to seed a real active stop.

Existing player + studio suites stay green.

## 6. Out of scope

Making `claude_cli` fast (it's inherently slow for interactive use — the timeout + stub recommendation is the
answer), real street-address lookup for POIs, and translating any already-persisted English content in
existing drafts (only newly generated content is Dutch).

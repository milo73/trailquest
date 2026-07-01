# Studio Validation / pre-publish — fully working (design)

**Date:** 2026-07-01
**Status:** Approved design, pre-implementation
**Scope:** Make the studio Validation screen real: compute the pre-publish report from the actual
draft (server-authoritative), and make "Publiceren naar moderatie" a real, gated action that sets
the draft to `review`. Backend (validate + publish endpoints) + frontend (Validation screen +
navigation). Builds on the merged studio (drafts, DraftStop content, custom stops).

## 1. Goal

Turn `/studio/validate` from a mock-rendered view into a working pre-publish gate:

- A **server-computed validation report** from the real draft: per-stop grounding, blocking/warning
  checks, and a `can_publish` verdict.
- **"Publiceren naar moderatie"** actually publishes — server re-validates and, if nothing blocks,
  sets the draft `status = "review"` (the design's moderation step). If something blocks, it refuses.
- The screen is **reachable** (a "Publiceren" button in the route editor).

"Kwaliteit is een poort, geen suggestie" (PRD/creator design): quality is enforced server-side, so a
client cannot publish a draft that fails validation.

## 2. Decisions (locked)

- **Publish target:** `status = "review"` (sent to moderation; shows as "In review" on the dashboard).
- **Blocking (refuses publish):** fewer than 2 stops; any stop missing `story` or `question`
  (incomplete content); any factless stop (`poi.facts == []`, including custom stops — strict
  grounding).
- **Warning (still publishable):** actual loop distance outside ±15% of the requested distance.
- **Server-authoritative:** `draft_service.validate` computes the report; `POST /drafts/{id}/publish`
  re-validates and returns **409** if it would block. The frontend renders the server's report and
  disables the button when blocking, but the server is the gate.
- **Walkability/tone checks are dropped** — not computable here (stylized map, no road-safety data).
  The screen shows only real checks.
- UI strings Dutch; offline-safe; no `window.confirm/alert/prompt`.

**Consequence (flagged):** because a factless stop blocks, the custom stops added in the previous
feature will block publishing until removed/replaced — a custom stop is a drafting aid; strict
grounding wins at publish. The blocking reason is surfaced per stop.

## 3. Backend

### 3.1 Schemas (`backend/app/models/schemas.py`)

```
CheckStatus:      "ok" | "warning" | "blocking"   (StrEnum)
StopGrounding:    order: int; name: str; grounded: bool; sources: str
ValidationCheck:  id: str; label: str; detail: str; status: CheckStatus
ValidationResult: checks: list[ValidationCheck]; per_stop: list[StopGrounding];
                  blocking: int; warnings: int; can_publish: bool
```

### 3.2 `draft_service.validate(draft: DraftTrail) -> ValidationResult`

- **per_stop:** for each stop, `grounded = len(stop.poi.facts) > 0`; `sources` = distinct source
  names joined with " · ", or "geen feiten" when none.
- **checks** (each is `ok`/`warning`/`blocking`):
  - `stops` — "Stops": `blocking` if `len(stops) < 2`, else `ok`; detail "N stops".
  - `content` — "Inhoud compleet": `blocking` if any stop has `story` empty/None OR `question` None;
    detail "K / M stops hebben verhaal + opdracht".
  - `grounding` — "Grounding": `blocking` if any stop is factless, else `ok`; detail
    "G / M stops met verifieerbare feiten".
  - `distance` — "Afstandstolerantie": `warning` if `abs(actual - requested) > 0.15 * requested`
    (and requested > 0), else `ok`; detail with the km values.
- `blocking` = count of checks with status `blocking`; `warnings` = count with status `warning`;
  `can_publish = blocking == 0`.

### 3.3 Endpoints (`backend/app/api/drafts.py`)

- `GET /drafts/{draft_id}/validation` → `ValidationResult`; 404 if the draft is unknown.
- `POST /drafts/{draft_id}/publish` → `DraftTrail`:
  - 404 if unknown;
  - compute `validate`; if `not can_publish` → **409** with `detail` = a short message + the
    blocking count (the client already has the full report from the GET; 409 is the safety gate);
  - else `draft_service.update(draft_id, DraftUpdate(status=DraftStatus.REVIEW))` and return the draft.

No new store/model plumbing beyond the schemas; publish reuses the existing status update.

## 4. Frontend

### 4.1 API layer

- `api/types.ts`: `CheckStatus`, `StopGrounding`, `ValidationCheck`, `ValidationResult` (mirror §3.1).
- `api/drafts.ts`: `getValidation(draftId) -> Promise<ValidationResult>` (GET);
  `publishDraft(draftId) -> Promise<DraftTrail>` (POST; throws `ApiError` on 409/404).

### 4.2 Validation screen (`studio/screens/Validation.tsx`)

- **Mount-load** the active draft (the pattern from StopEditor: if no draft and
  `localStorage["tq.studio.draft"]`, `loadDraft`).
- On a draft being available, `getValidation(draft.id)` into state (loading + error states).
- Render the real `checks` (with `blocking`/`warning`/`ok` styling), the `per_stop` grounding list,
  and the `blocking`/`warnings` summary counts — replacing `VALIDATION_REPORT` entirely (the mock
  module can be deleted once unused).
- **"Publiceren naar moderatie":** `disabled` when `report.blocking > 0`; on click
  `publishDraft(draft.id)` → on success show "Verzonden naar moderatie" (the draft status is now
  `review`; the dashboard reflects it). On an `ApiError` (409) show a blocking message.
- A **"← Terug naar route-editor"** link (→ `/studio/route`) so the creator can fix blocking issues.
- The mock-only three resolution buttons ("Stop overslaan" / "Niet-feitelijk verhaal" /
  "Toch behouden") are dropped.

### 4.3 Navigation

Add a **"Publiceren"** button to the RouteEditor header actions (next to "Voorvertoning") →
`navigate("/studio/validate")`, so the screen is reachable.

## 5. Content-accuracy guardrails

- Grounding is the platform's content guarantee: a factless stop blocks publish, so a published
  trail's stops are all fact-grounded. Publishing converts a draft toward a playable trail, and the
  player only ever sees grounded content.
- The gate is enforced **server-side** (the publish endpoint), not merely in the UI.

## 6. Testing

**Backend (pytest, offline seed):**
- `validate`: a ≥2-stop draft whose stops all have facts + story + question and whose distance is in
  tolerance → `can_publish=true`, `blocking=0`. A factless stop → grounding blocking. A stop missing
  story/question → content blocking. `< 2` stops → stops blocking. Distance out of tolerance → a
  warning, `can_publish` still true.
- `POST /drafts/{id}/publish`: success sets `status="review"` and returns the draft; a blocking draft
  → 409; unknown draft → 404. `GET /drafts/{id}/validation` shape + 404.

**Frontend (Vitest + RTL, mocked fetch):**
- `getValidation`/`publishDraft` request shapes + `ApiError` on non-2xx.
- Validation: renders the fetched per-stop grounding + blocking/warning counts; the publish button is
  disabled when `blocking > 0`; a clean publish shows "Verzonden naar moderatie"; a 409 shows the
  blocking message.
- RouteEditor: the "Publiceren" button navigates to `/studio/validate`.

Existing player + studio suites stay green.

## 7. Out of scope

The actual moderation queue/approval (post-`review`), versioning, analytics, editing a published
trail, converting a published draft into a player-facing `Trail`, and reachability from the Stop
editor (route-editor button is enough for now). Each is a clean follow-up.

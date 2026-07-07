# Studio completeness — delete, theme, preview, real dashboard (design)

**Date:** 2026-07-07
**Status:** Approved design, pre-implementation
**Scope:** Close the High + Medium gaps from the creator-studio audit: draft delete, theme editing,
the top-bar "+ Nieuwe tocht" fix, a working Voorvertoning (player-preview modal), a real (non-mock)
dashboard with working filters, stop insertion position, and mock/dead-code cleanup.

## Context (audit findings being addressed)

- No way to delete a draft anywhere (no UI, no `DELETE /drafts/{id}` endpoint).
- Theme is not editable after creation (backend `PUT /drafts/{id}` already supports `theme`;
  `RouteEditor.tsx:251` even shows a hardcoded "Historisch").
- The top-bar "+ Nieuwe tocht" (`StudioChrome.tsx:112-133`) navigates to an empty editor instead of
  opening the `NewTrailForm` modal the Dashboard card uses.
- The RouteEditor "Voorvertoning" button (`RouteEditor.tsx:138-151`) has no onClick — dead stub.
- Dashboard stat tiles render `MOCK_DASHBOARD_STATS` (fake plays/rating) and the filter chips
  (Alle/Gepubliceerd/Concept/In review) are visual-only; `MOCK_TRAILS` cards mix with real drafts.
- New stops can only be appended; no insertion position.
- `frontend/src/studio/mock/validation.ts` is orphaned dead code.

Explicitly staying deferred (not this round): unpublish/versioning of live trails, multi-user/auth,
undo/redo, pagination, the dead "Bibliotheek/Inzichten" tabs.

## 1. Draft delete

**Backend:** add `delete(draft_id) -> bool` to the `DraftStore` ABC and both backends
(`InMemoryDraftStore`: pop from the dict; `FileDraftStore`: unlink `<id>.json` via the existing
path-traversal-guarded `_path`). Deleting a draft does **not** touch `content_cache` (stop content is
shared across drafts by design) and does **not** touch `published_trails` (published snapshots are
immutable; deleting a draft never takes a live trail offline). New endpoint in `api/drafts.py`:
`DELETE /drafts/{id}` → 204 on success, 404 when unknown (`drafts.delete` returns False).

**Frontend:** `api/drafts.ts` gains `deleteDraft(id)`; `draftStore` gains a `removeDraft(id)` action
that calls the API, drops the draft from local state, and clears the persisted active-draft id when it
was the deleted one. Dashboard `DraftCard` gets a delete action ("Verwijderen") that opens a Dutch
confirmation dialog ("Tocht verwijderen? Dit kan niet ongedaan worden.") with "Verwijderen" /
"Annuleren"; `stopPropagation` so the card-open click is not triggered.

## 2. Theme editor (RouteEditor)

Replace the hardcoded "Historisch" text with a `<select>` over the six `Theme` values using the same
Dutch labels as `NewTrailForm` (historical→"Historisch", hidden_gems→"Verborgen parels",
family→"Familie", architecture→"Architectuur", nature→"Natuur", mixed→"Gemengd"), value =
`draft.theme`. On change → the draftStore issues `PUT /drafts/{id}` with `{theme}` (mirror the
existing `renameDraft` action; backend support exists at `draft_service.py:123-124`).

**Behavioral note (shown as a hint under the select):** changing the theme updates the trail's
metadata/label only — existing stop stories keep their generated content until the creator regenerates
them in the StopEditor (content is generated per POI × theme). Dutch hint: "Bestaande verhalen
veranderen pas na opnieuw genereren."

## 3. Top-bar "+ Nieuwe tocht" opens the form

`StudioChrome.tsx` renders the existing `NewTrailForm` (same component as the Dashboard) behind local
modal state; the "+ Nieuwe tocht" button opens it. Submit → `createDraft(req)` (the store action) →
close + `navigate("/studio/route")`; errors rethrow so the form shows them (same contract as the
Dashboard's `handleGenerate`).

## 4. Voorvertoning — player-preview modal (RouteEditor)

The "Voorvertoning" button opens a read-only modal styled as a `PhoneFrame` ("Zo ziet de speler het"):
- top: `TileMap` with the draft's stops (start = "S") + `route_geometry`;
- below, scrollable: per stop the order + POI name, a story excerpt (first ~150 chars, "—" when
  empty), and the primary question prompt (when present).
No publish required, no editing. Close via backdrop or "Sluiten". New component
`frontend/src/studio/components/TrailPreviewModal.tsx` (modeled on the CustomStopForm modal pattern).

## 5. Real dashboard (stats + filters)

- Remove `MOCK_TRAILS` and `MOCK_DASHBOARD_STATS` usage from `Dashboard.tsx`. Cards render only real
  drafts (as they already do at `Dashboard.tsx:222-225`).
- Stat tiles computed from real data: **Tochten** (draft count), **Live** (drafts with
  `status === "published"`), **Concepten** (`status === "concept"`), **Stops** (sum of
  `draft.stops.length`). The fake "plays"/"rating" tiles are removed (no data source exists).
- The filter chips become functional: local state `filter: "alle" | "published" | "concept" |
  "review"`; the card grid filters by `draft.status` (Alle shows everything). Chip visual state
  follows the selection.

## 6. Stop insertion position

`PoiPicker` and `CustomStopForm` gain an "Invoegen na" `<select>` (options: "Begin (na start)", each
existing stop "Na stop N — {name}", default "Einde"). Client-side only: the add flows append as today,
then the draftStore moves the new stop to the requested position via the existing reorder/PUT logic
(one extra `PUT /drafts/{id}` with the reordered stops; re-measure runs server-side as it already does
on update). No backend change.

## 7. Cleanup

Delete `frontend/src/studio/mock/validation.ts` (orphaned). Remove `MOCK_TRAILS`/
`MOCK_DASHBOARD_STATS` exports if nothing else imports them after §5 (check `mock/trails.ts`
consumers; delete the file when empty of consumers).

## Testing

**Backend (pytest, offline):** store `delete` round-trip for memory + file backends (file unlinked;
deleting unknown returns False); `DELETE /drafts/{id}` → 204 then GET → 404; unknown id → 404;
deleting a published-from draft leaves `GET /trails/{id}` working (immutability).

**Frontend (Vitest + RTL, mocked fetch):** Dashboard delete flow (confirm dialog → DELETE called →
card gone; cancel keeps it); theme select renders the draft's theme and change issues PUT with the new
theme + shows the hint; StudioChrome "+ Nieuwe tocht" opens NewTrailForm and submit navigates;
TrailPreviewModal renders per-stop name/story-excerpt/primary-question from a fixture draft; dashboard
stats reflect a fixture set (counts) and filter chips filter the grid; insertion position places a new
stop at the chosen order. Existing suites stay green; typecheck + build clean.

## Out of scope

Unpublish/re-publish lifecycle actions; multi-user/auth/ownership; undo/redo; pagination/virtualized
lists; the "Bibliotheek"/"Inzichten" tabs; auto-geocoding in CustomStopForm; per-stop scroll behavior.

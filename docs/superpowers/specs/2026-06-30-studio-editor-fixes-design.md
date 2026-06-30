# Studio editor fixes — RouteEditor & StopEditor robustness/UX (design)

**Date:** 2026-06-30
**Status:** Approved design, pre-implementation
**Scope:** Fix the bugs and add the missing affordances the user reported in the Route and Stop
editors: persist the active stop (so save/regenerate survive reload), rename the route, a clickable
logo, a working add-stop chooser (catalog picker + custom stop), stop pagination, return-to-route,
and loading/error feedback. Frontend-first, with one small new backend endpoint for custom stops.

## 1. Goals (the reported items)

RouteEditor:
- **Rename the route** — the title is read-only; make it editable + autosaved, with a save-status indicator.
- **Logo → /studio** — the "TrailQuest" wordmark is a non-clickable `<span>`; make it navigate to `/studio`.
- **Add stop actually works** — the `PoiPicker` has no loading state (the live POI source is slow → blank list). Add loading/empty/error states. Also allow **adding a custom (non-catalog) stop**.

StopEditor:
- **Save the stops** — saves silently no-op after reload (root cause below); fix + show save status.
- **Pagination** — the prev/next buttons are decorative; wire them to step through `draft.stops`.
- **Return to the active route** — add a "← Terug naar route" link.
- **Regenereer works / is visible** — the call can stall (claude_cli) or silently no-op; add loading + error feedback and fix the no-op root cause.

## 2. Root cause (the core bug behind "save" + "regenereer")

`activeStopOrder` lives only in the in-memory draft store (`draftStore.tsx`); only the **draft id** is
persisted (`localStorage["tq.studio.draft"]`). After any reload of `/studio/stop`, `activeStopOrder`
is `undefined`, so:
- the editor falls back to `MOCK_STOP`, and
- every `saveStory`/`saveQuestion`/`handleRegenerate` is guarded out by `if (activeStopOrder === undefined) return` — i.e. silently does nothing.

Additionally the StopEditor never loads the draft on mount (only RouteEditor does), so a direct
reload/deep-link to `/studio/stop` has no draft at all.

## 3. Decisions (locked)

- **Rename:** inline click-to-edit title, autosaved on blur (no separate Save button), with a shared
  "Bezig… / Opgeslagen ✓" status indicator.
- **Add stop:** keep the catalog picker (fixed) AND add a custom-stop form (name required + optional
  lat/lon defaulting to the draft start).
- **Custom stop = factless:** a custom POI carries `facts: []`. Per the creator design rules
  (design_creators.md §3), it is a deliberately non-factual stop — flagged "geen feiten"; its story
  is non-factual and its question should not gate. (Deeper gating enforcement for factless stops is
  a fast-follow; the existing `canGate` + answer-required UI already discourages it.)
- **Custom-stop location:** name + optional latitude/longitude; missing coords default to
  `draft.start`. (Click-to-place needs real map tiles — explicitly out of scope.)
- **Frontend-first; one new backend endpoint** (`POST /drafts/{id}/stops`) for the custom stop.
- UI strings Dutch; offline-safe; no `window.confirm/alert/prompt`.

## 4. Backend

One new endpoint + service function (the rest already exists).

### 4.1 Schema (`backend/app/models/schemas.py`)

```
CustomStopRequest:  name: str; lat: float | None = None; lon: float | None = None
```

### 4.2 `draft_service.add_custom_stop`

```
add_custom_stop(draft_id, *, name, lat=None, lon=None) -> DraftTrail | None
```
Load the draft (None → 404). Build a `POI(id=f"custom:{uuid4}", name=name,
location=GeoPoint(lat=lat ?? draft.start.lat, lon=lon ?? draft.start.lon), facts=[])`. Append a
`DraftStop(order=len(stops)+1, poi=poi)`. Re-measure (distance/duration/attributions via the
existing `_measure`). Persist. Return the draft. The synthetic id is namespaced `custom:` so it
never collides with catalog/OSM ids, and because it lives in `draft.stops` the existing
`update(stop_poi_ids=...)` reorder/remove path preserves it (reuse-by-id).

### 4.3 Router

`backend/app/api/drafts.py`: `POST /drafts/{draft_id}/stops` body `CustomStopRequest` →
`draft_service.add_custom_stop`; 404 if the draft is unknown. (Distinct path from
`PUT /drafts/{draft_id}/stops/{order}`.)

## 5. Frontend

### 5.1 Draft store (`studio/draftStore.tsx`)

- **Persist `activeStopOrder`** to `localStorage["tq.studio.activeStop"]` in `setActiveStop`; restore
  it when the provider initializes (parse int or undefined).
- **`renameDraft(title: string): Promise<void>`** → `updateDraft(draft.id, { title })`, replace draft
  with the server copy.
- **`addCustomStop(body: { name: string; lat?: number; lon?: number }): Promise<void>`** → new
  `createCustomStop` API client → replace draft with the server copy.
- **`saving: boolean`** flag exposed from `useDraft()`, set true around each network mutation
  (`renameDraft`, `saveStopContent`, `addStop`/`removeStop`/`reorder`, `addCustomStop`) and false in
  `finally`. Consumers render a status chip.

### 5.2 API client (`api/drafts.ts`, `api/types.ts`)

- `types.ts`: `CustomStopRequest { name: string; lat?: number; lon?: number }`.
- `drafts.ts`: `createCustomStop(draftId, body: CustomStopRequest) -> Promise<DraftTrail>` →
  `POST /drafts/{id}/stops`.

### 5.3 StudioChrome — clickable logo

The "TrailQuest" wordmark becomes a `<button>`/link styled identically, `onClick → navigate("/studio")`.

### 5.4 PoiPicker — loading/empty/error

Add a `loading` state (true until the `getPois` promise settles). Render "POI's laden…" while
loading, "Geen POI's gevonden" when the result is empty, and "Kon POI's niet laden" on `ApiError`.

### 5.5 RouteEditor

- **Add-stop chooser:** "+ Stop toevoegen" opens a small menu/dialog with "Kies uit de buurt" (opens
  the `PoiPicker`) and "Maak een nieuwe stop" (opens a custom-stop form: name + optional lat/lon → 
  `addCustomStop`). Both close on success.
- **Inline rename:** the header title is an `<input>` (or click-to-edit) bound to the draft title,
  `onBlur → renameDraft`. Show the shared save status next to it.
- (Logo handled in StudioChrome.)

### 5.6 StopEditor

- **Mount effect:** if `!draft` and `localStorage["tq.studio.draft"]` exists, `loadDraft(savedId)`
  (mirrors RouteEditor) so a reload/deep-link restores the draft; `activeStopOrder` is restored by
  the store (§5.1).
- **Pagination:** compute `orders = draft.stops.map(s => s.order)`; `i = orders.indexOf(activeStopOrder)`;
  prev → `setActiveStop(orders[i-1])`, next → `setActiveStop(orders[i+1])`; disable at the ends; label
  `STOP {i+1} / {orders.length}`.
- **Return to route:** "← Terug naar route" → `navigate("/studio/route")`.
- **Feedback:** wrap `handleRegenerate` in try/catch → on failure set an error message ("Genereren
  mislukt — probeer opnieuw"); keep the existing `regenerating` disable + "Genereren…" label. Show
  the shared save status for content saves. When there's no active stop (after the mount fix this is
  rare), show "Geen stop geselecteerd — kies een stop in de route-editor" instead of editing MOCK_STOP.

## 6. Content-accuracy guardrails

- Catalog POIs keep their retrieved facts (locked, unchanged).
- A **custom POI has `facts: []`** → shown as "geen feiten"; its story is non-factual and it is not a
  grounded gating source. This is the sanctioned "bewust niet-feitelijk verhaal" exception
  (design_creators.md). The locked-facts zone and the `Question` 422 gate are unchanged.

## 7. Testing

**Backend (pytest, offline):**
- `add_custom_stop` appends a factless `DraftStop` (id starts `custom:`, facts empty), defaults coords
  to the start when omitted, re-measures, persists; unknown draft → None.
- `POST /drafts/{id}/stops` round-trip (returns the draft with the new stop) + 404.

**Frontend (Vitest + RTL, mocked fetch):**
- store: `activeStopOrder` persists to and restores from localStorage; `renameDraft` PUTs the title;
  `addCustomStop` POSTs and replaces the draft; `saving` toggles around a save.
- `api/drafts`: `createCustomStop` request shape.
- StudioChrome: clicking the wordmark navigates to `/studio`.
- PoiPicker: shows "POI's laden…" before the fetch resolves; empty + error messages.
- RouteEditor: the add-stop chooser opens both paths; the custom form calls `addCustomStop`; the title
  input renames on blur.
- StopEditor: prev/next change the active stop (label updates); "Terug naar route" navigates; a failed
  Regenereer shows the error; after a simulated reload (draft cleared, localStorage set) the draft +
  active stop restore and a save fires the PUT.

Existing player + studio suites stay green.

## 8. Out of scope

Real map tiles / click-to-place, the Validation/pre-publish screen, publish→moderation, deeper
factless-stop gating enforcement, a client-side request timeout for slow `claude_cli`. Each is a
clean follow-up.

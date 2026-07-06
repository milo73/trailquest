# Publish → playable trails + accurate route map (design)

**Date:** 2026-07-05
**Status:** Approved design, pre-implementation
**Scope:** Two related features that close the studio→player loop and make the editor map truthful.
**A — Publish → playable:** a validated draft self-publishes into an immutable, persistent player
`Trail`; players browse and play published trails. **B — Accurate map:** the `MapCanvas` plots the
real stop coordinates instead of hardcoded waypoints.

## Context

Today publishing only flips a draft's `status` to `review` — **nothing becomes playable**.
`DraftStatus.PUBLISHED` is defined but never set; `active_trails` is in-memory only; the player always
*generates* a trail on demand (`POST /trails`) and never loads a published one (the `getTrail` client
exists but is unused). `validate`/`can_publish` already guarantees a draft is structurally convertible
to a player `Trail` (complete stops). Separately, the studio/player `MapCanvas` renders a stylized SVG
from **hardcoded waypoints** and ignores `poi.location`, so the map shape is unrelated to the real route.

## Locked decisions

- **Self-publish → direct playable** (no separate moderator): "Publiceren" on a validated draft
  publishes it (`status=published`) AND creates the playable trail. Matches PRD MVP "AI + sampling, no
  human-in-the-loop".
- **Browse list in the player**: a landing screen lists published trails; picking one loads + plays it.
- **Accurate SVG map** (real coordinates): no map library, no tiles; falls back to today's waypoints when
  no coordinates are supplied.
- Offline-safe; degrade rather than break; UI strings Dutch.

## Feature A — Publish → playable

### A.1 Conversion + immutable snapshot (`backend/app/services`)

A converter builds a player `Trail` from a validated `DraftTrail`. Because `can_publish` guarantees
completeness, each `DraftStop → Stop` maps directly (`story` present, `questions` ≥1,
`primary_question_index` valid). The `Trail` **reuses the draft id** (`trail.id = draft.id`) so
"play draft X" = `GET /trails/X`, needing no mapping table. The trail embeds its stops **by value**
(an immutable snapshot) — later draft edits do not change the live trail until re-publish. Put the
converter in `draft_service` (e.g. `to_trail(draft) -> Trail`) or a small `publish_service`.

### A.2 Published-trails registry (`backend/app/cache/store.py`)

A `PublishedTrailStore` mirroring `DraftStore`: `put(trail)`, `get(id) -> Trail | None`,
`list() -> list[Trail]`, `clear()`. Two backends — `InMemoryPublishedTrailStore` (default) and a
file backend (`<id>.json` under a `published_store_path`) selected by `TRAILQUEST_PUBLISHED_STORE`
(`memory`/`file`), the same shape as `_build_draft_store`. Stores the full `Trail` JSON (embedded
stops — no ref-normalization; snapshots are immutable). Module singleton `published_trails`.

### A.3 Endpoints

- `POST /drafts/{id}/publish` (`api/drafts.py`): validate → 409 if `not can_publish` (unchanged) →
  else `trail = to_trail(draft)`, `published_trails.put(trail)`, set draft `status=published`, return
  the draft. (Self-publish; skips the `review` limbo.)
- `GET /trails` (`api/trails.py`): return `published_trails.list()` (the browse list).
- `GET /trails/{id}`: resolve `published_trails.get(id) or active_trails.get(id)` (published first),
  404 if neither.
- `POST /trails/{id}/answer`: resolve the trail the same way (published or active), then evaluate as
  today. Add a shared `_resolve_trail(id)` helper.

### A.4 Player — browse + play (`frontend/src/quester`)

- `api/trails.ts`: add `listTrails() -> Trail[]` (`GET /trails`); `getTrail(id)` already exists.
- A new **browse landing** screen (e.g. `quester/screens/Browse.tsx`): on mount `listTrails()`
  (loading/empty/error states); render a card per trail (title/city/theme · distance · stops) with a
  "Speel" button → `getTrail(id)` → `setTrail(trail)` (→ preview phase). A "Zelf genereren" button →
  the existing on-demand configure flow. Wire it as the player's default landing: `/play` shows Browse;
  "Zelf genereren" leads to the current `Configure` phase. (Add a `browse` phase to the quester store /
  `QuesterApp` switch, defaulting to it; `setTrail` already advances to `preview`.)

### A.5 Studio — publish copy + play link

- `Validation.tsx`: "Publiceren" now publishes directly — on success show "Gepubliceerd — Live" and a
  "Speel in de app" link that opens the player browse (`/play`), where the just-published trail now
  appears in the list (no deep-link route needed). Update the "naar moderatie" copy.
- `Dashboard.tsx`: the `published` badge already reads "Live"; a published card gets the same
  "Speel"/"Bekijk in app" link to `/play`.

## Feature B — Accurate route map (`frontend/src/design-system/primitives/MapCanvas.tsx`)

Make `MapCanvas` coordinate-aware while preserving the current look and back-compat:
- Accept an optional coordinate per stop (`lat`/`lon`) plus an optional `start` point. When coordinates
  are present, compute the bounding box of `{start, ...stops}`, normalize each point into the canvas
  with padding (invert `y` so higher latitude is up), and place the dots there; draw the route as an
  **ordered loop** `start → stop 1 … stop N → start`. When no coordinates are supplied, keep today's
  hardcoded-waypoint rendering (so existing callers are unaffected).
- Degenerate cases: a single point or all-identical coordinates → center the point(s) without dividing
  by a zero span.
- `RouteEditor.tsx`: build `mapStops` from `draft.stops` carrying `poi.location` (lat/lon) and pass
  `draft.start` — so the editor map reflects the true route shape. (The player `Preview`/`Navigate` may
  adopt the same later; not required here.)

## Testing

**Backend (pytest, offline):**
- Converter: a validated draft → `Trail` with `id == draft.id`, city/theme/distances/start carried,
  each `DraftStop → Stop` (story + questions + primary), attributions preserved.
- `PublishedTrailStore`: `put`/`get`/`list` round-trip; file backend persists across instances.
- `POST /drafts/{id}/publish`: a publishable draft → status `published` AND `GET /trails/{id}` returns
  the playable trail; a blocking draft → 409 (no trail created). `GET /trails` lists published trails.
- `POST /trails/{id}/answer` resolves a published trail (not only `active_trails`).

**Frontend (Vitest + RTL, mocked fetch):**
- Player Browse: lists trails from `GET /trails`; "Speel" loads by id and enters preview; loading/empty.
- Studio: publish success shows the "Live"/"Speel" link.
- `MapCanvas`: given real coordinates, dots render at the expected normalized positions (bounding-box
  fit); with no coordinates, the existing waypoint rendering still works.

Existing player + studio suites stay green.

## Out of scope

A separate moderator role / reject flow / moderation queue (self-publish chosen); real map tiles /
click-to-place; unpublish/versioning of live trails; player rating/analytics; adopting the coord map in
every player screen (RouteEditor only here).

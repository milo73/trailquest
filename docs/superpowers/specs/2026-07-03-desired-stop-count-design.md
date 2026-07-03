# Stage 2 — Desired stop count as a generation input (design)

**Date:** 2026-07-03
**Status:** Approved design (from the atomic-model roadmap), pre-implementation
**Roadmap:** `~/.claude/plans/recursive-floating-clover.md` — Stage 2 of 4.
**Scope:** Let route generation take a **desired number of stops** as an optional input instead of
always deriving the count from distance. Backend threads it into POI selection; the studio surfaces
an "aantal stops" input on concept generation. Small, additive, no persistence change.

## 1. Why

Today `route_service._select_pois` derives `target_stops = max(2, round(distance_km))` — the creator
can't ask for "a short 3-stop loop" vs "a dense 8-stop walk". The atomic model wants
"generate a route from start + length + **desired # of stops**". This adds that input, defaulting to
today's distance-derived behavior when omitted.

## 2. Decisions (locked)

- **Optional, defaulted:** `desired_stops: int | None`; when `None`, the count is distance-derived
  exactly as today. Bounded `ge=2, le=15`. The result is clamped to `[2, number of grounded POIs
  found]` so a request for more stops than exist degrades gracefully.
- **Studio-only UI:** the input appears in the studio's concept-generation control (RouteEditor
  "Genereer concept"). The **player** trail-create stays distance-only (PRD §19: distance-based
  input in MVP). The backend `TrailRequest` still carries `desired_stops` (it is the internal
  carrier used by concept generation, and harmless on the player API), but no player UI is added.
- No persistence change (`desired_stops` is a generation-time input, not stored on the draft).

## 3. Backend

`backend/app/models/schemas.py`:
- `TrailRequest`: add `desired_stops: int | None = Field(default=None, ge=2, le=15)`.
- `DraftCreate`: add `desired_stops: int | None = Field(default=None, ge=2, le=15)`.

`backend/app/services/route_service.py`:
- `_select_pois(candidates, distance_km, desired_stops=None)`:
  ```python
  with_facts = [p for p in candidates if p.has_verifiable_facts]
  target = desired_stops if desired_stops is not None else max(2, round(distance_km))
  target = max(2, min(target, len(with_facts)))
  return with_facts[:target]
  ```
  (`max(2, …)` keeps the existing floor; `min(…, len(with_facts))` is the graceful clamp.)
- `generate_trail(req)`: pass `req.desired_stops` into `_select_pois`.

`backend/app/services/draft_service.py`:
- `create(req)` (the `from_concept` branch): pass `req.desired_stops` into the `TrailRequest` it
  builds for `generate_trail`.

## 4. Frontend

`frontend/src/api/types.ts`: `TrailRequest` and `DraftCreate` gain `desired_stops?: number`.

`frontend/src/studio/screens/RouteEditor.tsx` (`handleGenereer`):
- Add a small **"aantal stops"** numeric input (local state, default empty = auto) near the "Genereer
  concept" control. When set, pass it as `desired_stops` in the `createDraft({ …, from_concept: true })`
  call; when empty, omit it (distance-derived). Dutch label; keep mockup inline hex.

## 5. Testing

**Backend (pytest, offline seed):**
- `_select_pois` honors `desired_stops` when the seed set has enough grounded POIs; clamps down to the
  number available when asked for more; falls back to `max(2, round(distance_km))` when `None`.
- `draft_service.create(DraftCreate(from_concept=True, desired_stops=N))` yields a draft whose stop
  count reflects `N` (clamped to the grounded seed set).

**Frontend (Vitest + RTL, mocked fetch):**
- RouteEditor: entering an "aantal stops" value and generating passes `desired_stops` in the
  `createDraft` POST body; leaving it blank omits it.

Existing suites stay green.

## 6. Out of scope

Player-facing stop-count input (PRD §19), a full route-generation form (distance/theme controls),
and Stages 3–4. `desired_stops` is not persisted.

# Stage 4 — Stop as a first-class entity (design)

**Date:** 2026-07-03
**Status:** Approved scope (full normalization), pre-implementation
**Roadmap:** `~/.claude/plans/recursive-floating-clover.md` — Stage 4 of 4.
**Scope:** Make a **Stop** a first-class, reusable entity keyed by a stable `stop_id`; routes reference
stop content by id and the store **hydrates on read**, so editing/regenerating a stop reflects in every
route that uses it. **Clean slate** (nothing is persisted — both stores default to `memory`, no `.env`
overrides, no `drafts/` dir, no content DB), so there is **no migration** — we build the normalized
shape directly, with no `mode="before"` legacy-lift for refs and a fresh SQLite schema.

## 1. Why + the key design move

The atomic model wants "a Stop is reusable across routes; edit it once, it updates everywhere." Today
`Trail`/`DraftTrail` **embed** stops by value, so the same POI on two drafts is two independent copies.

**The move:** keep the domain models' `stops` field (the API + frontend barely change — each stop just
gains `id`), but make the **store layer** the source of truth for stop content. A route persists only
**stop references** (`stop_id` + `order`); the content lives once in a **stop store** keyed by `stop_id`;
reading a route **hydrates** its refs from that store. Because every read hydrates from the shared store,
an edit to `stop_id` X is seen by every route referencing X on its next read — with the ref/hydration
logic confined to `store.py`, not smeared across services or response DTOs.

`stop_id = f"{poi_id}::{theme}"` — a string encoding of the existing `(POI × theme)` cache key, so it is
stable across regeneration (a new version lands under the same id) and needs no new SQLite column beyond
re-keying.

## 2. Decisions (locked)

- **Models keep `stops`; stops gain `id`.** `Stop`/`DraftStop` gain `id: str` (= `stop_id`). `Trail`/
  `DraftTrail` keep `stops: list[…]` (hydrated). No `stop_refs` on the models — refs are an internal
  persistence detail of the store.
- **The store normalizes.** `DraftStore.put` writes each stop's content to the stop store under its
  `stop_id` and persists a lightweight `DraftRecord` (metadata + `stop_refs` + status); `DraftStore.get`
  hydrates refs → content → a `DraftTrail`. Both memory and file backends hydrate from the shared stop
  store, so edits propagate across drafts.
- **Player path: hydrate-once.** `active_trails` keeps the fully-hydrated `Trail` for a stable live
  session (an in-flight player isn't mutated by a later creator edit). Trail generation still reuses the
  stop store (so it benefits from cached/edited content), and the **answer flow is unchanged** (resolves a
  stop by `order` from the embedded stops).
- **Clean slate → no migration.** No legacy-lift validators for refs; SQLite content table re-keyed on
  `(stop_id, version)` via a fresh `CREATE TABLE` (there is no existing DB).
- Offline-safe; degrade rather than break; UI strings Dutch.

## 3. Backend

### 3.1 Schemas (`backend/app/models/schemas.py`)

- `def stop_id_for(poi_id: str, theme: Theme) -> str: return f"{poi_id}::{theme.value}"`.
- `StopContent(BaseModel)` — the authoritative, order-free content of a stop (draft-shaped, content
  optional): `{poi: POI; story: str | None = None; questions: list[Question] = []; primary_question_index: int | None = None}`.
- `StopRef(BaseModel){ stop_id: str; order: int }`.
- `Stop`: add `id: str`. `DraftStop`: add `id: str`. (Set at hydration; a small default/derivation keeps
  direct construction in tests ergonomic — e.g. `id` defaults to `""` and is filled on hydrate.)

### 3.2 Stop store (`backend/app/cache/store.py`)

Generalize the content store to hold `StopContent` keyed by `stop_id`, versioned:
- `get(stop_id) -> StopContent | None` (latest version); `put(stop_id, content, *, source, review_status) -> int`.
- In-memory: `dict[str, list[version]]`. SQLite: PK `(stop_id, version)`, `content_json` = `StopContent`
  (fresh `CREATE TABLE`). Keep `sample_unreviewed`/`set_review_status` keyed by `stop_id`.
- Keep a thin `(poi_id, theme)` convenience (`get_for(poi_id, theme)` = `get(stop_id_for(...))`) for the
  player generation path.

### 3.3 Draft store (`backend/app/cache/store.py`)

- `DraftRecord` (persisted): `{id, title, city, theme, start, requested_distance_km, actual_distance_km,
  estimated_duration_min, status, attributions, stop_refs: list[StopRef]}` — no embedded stop content.
- `DraftStore.put(draft: DraftTrail)`: for each `draft.stops[i]`, compute `stop_id = stop_id_for(poi.id,
  draft.theme)`, write its `StopContent` to the stop store (a new version only when it differs from the
  latest), and record `StopRef(stop_id, order)`. Persist the `DraftRecord`.
- `DraftStore.get(draft_id)`: load the `DraftRecord`; for each ref, `stop_store.get(stop_id)` → a
  `DraftStop` with `id=stop_id`, `order=ref.order`, and the content (missing content → a stop with the POI
  and empty story/questions). Return the hydrated `DraftTrail`. `list_drafts` hydrates each.
- File backend persists `DraftRecord` as `<id>.json`; memory backend holds `DraftRecord`s. Both hydrate
  through the shared stop store.

### 3.4 Services

- `content_service.build_stop(poi, theme, order) -> Stop`: read the stop store by `stop_id`; on a complete
  hit project `StopContent → Stop(id=stop_id, order=order, …)`; on a miss generate, `put` the
  `StopContent`, and project. (Same cache-once behavior, now id-addressable.)
- `draft_service`: functions keep operating on the hydrated `DraftTrail` and persist via `drafts.put`
  (which normalizes) — so `add_stop`/`add_custom_stop`/`set_stop_content`/`generate_stop_content`/`update`
  need only ensure each stop has its POI/content and call `put`; the store writes content under `stop_id`,
  propagating edits. `validate` runs on the hydrated stops (unchanged logic).
- `route_service.generate_trail`: builds `Stop`s (now with `id`) via `build_stop`; `Trail` embeds them;
  `active_trails.put` stores the hydrated trail (hydrate-once).

### 3.5 API

No endpoint signature changes: responses are still `DraftTrail`/`Trail` with `stops` (each stop now
carries `id`). `POST /trails/{id}/answer` still keys on `stop_order` against the embedded stops.

## 4. Frontend

`api/types.ts`: `Stop` and `DraftStop` gain `id: string`. No other change — responses keep `stops`. (A
later, optional enhancement could surface "used in N routes"; out of scope here.)

## 5. Testing

**Backend (pytest, offline):**
- Stop store: `get`/`put` by `stop_id`, monotonic versioning, latest-wins; `stop_id_for` round-trips.
- **Edit propagation (the proof):** two drafts referencing the same catalog POI (same `stop_id`); editing
  the stop's content in draft A (`set_stop_content`) and re-reading draft B shows the new content.
- Draft store: `put` normalizes to a `DraftRecord` (no embedded content) + writes the stop store; `get`
  hydrates back to a `DraftTrail` with `stops` carrying `id`/`order`; a from-concept draft round-trips;
  a freshly-added stop with no authored content hydrates with its POI + empty content.
- Player: `generate_trail` produces stops with `id`; `active_trails` serves a stable trail; the answer
  flow (`/trails/{id}/answer`) still resolves by `order` and gates as before.
- `validate`/`publish` unchanged behavior on the hydrated draft.
- SQLite stop store: fresh schema, `(stop_id, version)` PK, round-trips a `StopContent`.

**Frontend (Vitest):** types gain `id`; existing player + studio suites stay green (add `id` to fixtures).

## 6. Out of scope

Sharing the `POI` object itself (a Stop still embeds its POI); a "used in N routes" UI; cross-session live
propagation into an in-flight player trail (hydrate-once is intentional); Wikidata coordinate extraction.
No data migration exists to write (clean slate) — if persistence is enabled before launch with data
present, a follow-up lazy-lift would be needed, but that is explicitly not this stage.

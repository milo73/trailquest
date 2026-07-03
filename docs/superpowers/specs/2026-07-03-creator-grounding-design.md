# Stage 3 — Creator grounding ingest (design)

**Date:** 2026-07-03
**Status:** Approved design (from the atomic-model roadmap), pre-implementation
**Roadmap:** `~/.claude/plans/recursive-floating-clover.md` — Stage 3 of 4.
**Scope:** Let a creator ground a custom stop by pasting a **Wikipedia/Wikidata link or QID**. A new
`grounding_service` resolves the reference and fetches **Wikidata facts + Wikipedia background** (reusing
the existing clients, plus one small Wikipedia addition), so the custom stop carries real facts instead
of being factless/publish-blocked. Backend service + one client function + `CustomStopRequest` change;
frontend custom-stop form field.

## 1. Why

Today `draft_service.add_custom_stop` builds `POI(id="custom:…", facts=[])` — factless, so it fails the
`grounding` publish check and can never carry a gating question. The atomic model wants facts that "can
be inputted by the creator by adding a link to the Wikipedia page." This closes that gap using the same
retrieved-ground-truth pipeline the live POI source already uses (Wikidata CC0 facts + Wikipedia CC-BY-SA
background), so a creator-grounded stop is a first-class factual stop.

## 2. Decisions (locked)

- **Ingest = Wikidata facts + Wikipedia background.** A resolved reference yields Wikidata facts (via
  `wikidata.fetch_entity`) and Wikipedia background (via `wikipedia.fetch_summary`), assembled into a
  grounded `POI(id=f"wikidata:{qid}", …)` with proper `Source` references. Facts carry the Wikidata
  source (CC0); background carries the Wikipedia source (CC-BY-SA, paraphrase-only) — identical to
  `poi_service._fetch_live`.
- **Reference forms accepted:** a bare QID (`Q1545193`), a Wikidata URL (`…/wiki/Q…`), or a
  Wikipedia URL/title (`…/wiki/Grote_Kerk`, any language subdomain). Wikipedia URLs resolve to a QID via
  a new `wikipedia.fetch_wikidata_qid` (MediaWiki `prop=pageprops&ppprop=wikibase_item`).
- **Degrade, don't break (PRD §13):** if the reference can't be resolved or a client fails, the stop is
  still added but **factless** (no 500). The existing `grounding` validation then flags it, exactly as an
  ungrounded custom stop today.
- **Grounding adds facts, not questions.** `add_custom_stop` attaches the grounded POI; the creator then
  authors/generates the question in the Stop editor ("Regenereer") from those facts — consistent with the
  current custom-stop flow. (Auto-generating a question on ingest is a fast-follow.)
- **Location stays creator-supplied.** Coordinates come from the creator's `lat`/`lon` or the draft start,
  as today. Extracting Wikidata coordinates (P625) is an optional enhancement, out of scope here.
- Offline-safe (all clients mocked in tests); UI strings Dutch.

## 3. Backend

### 3.1 Client — resolve a Wikipedia page to its QID (`backend/app/clients/wikipedia.py`)

Add:
```python
def fetch_wikidata_qid(title: str, lang: str = "en", timeout: float = 30.0) -> str | None:
    """Resolve a Wikipedia article title to its Wikidata QID (pageprops.wikibase_item)."""
```
Hits `https://{lang}.wikipedia.org/w/api.php` with
`action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=<title>&format=json`; returns the
first page's `pageprops.wikibase_item`, or `None` when absent; raises `ClientError` on HTTP/JSON error
(same pattern as `fetch_summary`).

### 3.2 New service (`backend/app/services/grounding_service.py`)

- `resolve_reference(ref: str) -> str | None`:
  - a `Q\d+` (optionally full Wikidata URL `wikidata.org/wiki/Q…` or `/entity/Q…`) → the QID;
  - a Wikipedia URL (`<lang>.wikipedia.org/wiki/<title>`) → parse lang + title → `fetch_wikidata_qid`;
  - anything else / unresolvable → `None`. Never raises (catches `ClientError` → `None`).
- `build_grounded_poi(ref: str, *, name: str | None = None, location: GeoPoint) -> POI`:
  - `qid = resolve_reference(ref)`; if `None` → return a factless POI (`id=f"custom:{uuid4}"`, `facts=[]`,
    `name = name or "Nieuwe stop"`).
  - else `entity = wikidata.fetch_entity(qid)` (catch `ClientError` → factless fallback);
    `source = Source(name="Wikidata", license=CC0, reference=f"wikidata:{qid}")`;
    `facts = [Fact(key=k, value=v, source=source) for k, v in entity.facts.items()]`;
    background via `wikipedia.fetch_summary(entity.enwiki_title)` when a title exists (catch `ClientError`
    → no background). Return
    `POI(id=f"wikidata:{qid}", name=name or entity.enwiki_title or "Nieuwe stop", location=location,
    facts=facts, background=…, background_source=Source(Wikipedia, CC-BY-SA, url))`.

### 3.3 Schema + service + API

- `CustomStopRequest` (`schemas.py`): `name: str | None = None` (now optional) and add
  `source_ref: str | None = None`.
- `draft_service.add_custom_stop(draft_id, *, name=None, lat=None, lon=None, source_ref=None)`: compute
  `location` (creator coords or draft start); if `source_ref` → `grounding_service.build_grounded_poi(
  source_ref, name=name, location=location)`; else the factless `POI(id="custom:…", name=name or
  "Nieuwe stop", facts=[])` as today. Append the `DraftStop`, `_measure`, persist.
- `api/drafts.py` `create_custom_stop`: pass `name=body.name, source_ref=body.source_ref` through. Still
  returns the draft (grounding failure degrades to a factless stop, not an error).

## 4. Frontend

- `api/types.ts`: `CustomStopRequest` gains `source_ref?: string` and `name` becomes optional.
- The custom-stop form (`studio/components/CustomStopForm.tsx`): add a "Wikipedia/Wikidata-link of QID"
  text input (optional); include `source_ref` in the submitted body. `draftStore.addCustomStop` /
  `api/drafts.createCustomStop` already forward the body — thread the new field.
- After a grounded add, the returned draft's stop shows real facts in the Stop editor's locked FEITEN
  panel (already renders `activePoi.facts`) — no extra wiring.

## 5. Testing

**Backend (pytest, offline — mock `httpx` as the existing client tests do):**
- `wikipedia.fetch_wikidata_qid`: returns the QID from `pageprops.wikibase_item`; `None` when absent;
  `ClientError` on HTTP error.
- `grounding_service.resolve_reference`: bare QID passthrough; Wikidata URL parse; Wikipedia URL →
  `fetch_wikidata_qid` (mocked) → QID; unresolvable → `None` (and a client error → `None`, not a raise).
- `grounding_service.build_grounded_poi`: with mocked `wikidata.fetch_entity` + `wikipedia.fetch_summary`
  → a POI with `id` starting `wikidata:`, the Wikidata-sourced facts, and background; a client failure or
  unresolvable ref → a factless POI (no raise).
- `draft_service.add_custom_stop(source_ref=…)`: yields a stop whose POI has facts (grounded); with no
  `source_ref`, still factless as today. `POST /drafts/{id}/stops` round-trips `source_ref`.

**Frontend (Vitest + RTL, mocked fetch):**
- `CustomStopForm`: the source-ref input's value is included in the `createCustomStop` POST body; the
  name field is optional when a source ref is given.

Existing suites stay green.

## 6. Out of scope

Auto-generating a question on ingest; Wikidata coordinate (P625) extraction; non-Wikimedia sources;
Stage 4 (stop identity). Grounding is not retroactively applied to existing factless stops.

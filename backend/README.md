# TrailQuest backend

Python/FastAPI backend for TrailQuest (PRD §9.4). MVP is a **modular monolith**:
one stateless app whose modules map to the target services (route, POI/data,
content/RAG, gamification) so they can be split out later.

The domain model in `app/models/schemas.py` encodes the project's central
constraint (PRD §8): retrieved **ground truth** is kept separate from
LLM-**generated** text, and questions are classified A/B/C/D by verifiability so
only data-bound questions may gate progress.

### Multi-question stops

A `Stop` now holds a **list** of questions (`questions: list[Question]`) plus a
`primary_question_index` (integer). The *primary* question is the gate: its type
determines whether the player must answer correctly before the next stop unlocks
(A/D gate on correctness; C gates-through; B is honor-system, never blocks). All
other questions are *bonus* — players can answer them but they never unlock the
next stop.

`POST /trails/{id}/answer` accepts an optional `question_index` field in the
request body (defaults to `primary_question_index` if omitted). Answer feedback is
written in Dutch (`"Correct! Door naar de volgende stop."`, `"Net niet."`,
`"Bedankt voor het delen — hier is geen fout antwoord."`, etc.).

The pre-publish validation (`GET /drafts/{id}/validation`) includes a
`primary_gate` check that blocks publish if any stop lacks a valid primary question
of a gating type (A or D) with a stored answer.

## Layout

```
app/
  main.py               FastAPI app + router wiring
  config.py             env-driven settings (Haarlem defaults, providers)
  api/                  HTTP layer: health, trails (the end-to-end vertical)
  models/schemas.py     domain model + gating invariants
  clients/
    overpass.py         OSM POI retrieval (Overpass API)
    wikidata.py         structured facts + enwiki title (Wikidata)
    wikipedia.py        paraphrasable narrative summary (Wikipedia); `fetch_wikidata_qid` resolves a Wikipedia article title to its Wikidata QID
    osrm.py             walking-network routing (OSRM trip service)
  services/
    route_service.py    POI selection + loop building + distance/duration
    poi_service.py      POI + fact retrieval (seed or live OSM/Wikidata)
    content_service.py  RAG pipeline: grounded story + question list, cached
    answer_service.py   gating: evaluate primary or bonus; 3 attempts then reveal, Dutch feedback
    gamification_service.py  points/bonuses
    grounding_service.py  resolve a creator-supplied `source_ref` (Wikipedia/Wikidata link or QID) to a grounded POI; degrades to a factless POI on any client failure
    llm/provider.py     provider-agnostic LLM (stub / claude_cli / ollama)
  cache/store.py        content store (POI × theme; memory/sqlite) + draft store (memory/file)
tests/                  pytest suite
```

## Data sources, routing, and the LLM (configurable)

Everything below defaults to **offline/stub** so the suite and a bare `uvicorn`
run need no network, keys, or models. Switch on real sources via env vars.

**POIs & facts** — `TRAILQUEST_POI_SOURCE=live` queries Overpass (OSM) for
Wikidata-linked POIs in range, then pulls structured facts from Wikidata: literal
values (build year, height) and reference-valued ones that need a label lookup
(architect, heritage status). It also fetches a paraphrasable Wikipedia summary
(CC BY-SA, attributed) as narrative background — never a source of gating facts.
Disable the Wikipedia step with `TRAILQUEST_ENRICH_WIKIPEDIA=false`. Falls back to
the bundled Haarlem seed set if Overpass fails.

**Content store** — `TRAILQUEST_CONTENT_STORE=sqlite` (+ `TRAILQUEST_CONTENT_DB_PATH`)
persists generated stops keyed by (POI × theme) with version, source, and review
status, so each (POI × theme) is generated **once** and reused across restarts and
users — the key cost lever (PRD §9.3). Default `memory` is in-process.

**Stop identity** — every stop is content-identified by a stable
`stop_id = "{poi_id}::{theme}"` (computed by `stop_id_for` in
`app/models/schemas.py`). The content store (`app/cache/store.py`) is keyed by
`stop_id` and stores `StopContent` — the authoritative, order-free content for
that (POI × theme) pair. `build_stop` in `app/services/content_service.py` always
looks up and writes the store under `stop_id` and sets `Stop.id` to it.

**Draft store** — `TRAILQUEST_DRAFT_STORE=file` (+ `TRAILQUEST_DRAFT_STORE_PATH`,
default `drafts`) persists creator-studio drafts as JSON files in a directory
across restarts. Default `memory` is in-process and drafts are lost on restart.

**Published-trails store** — `TRAILQUEST_PUBLISHED_STORE=file`
(+ `TRAILQUEST_PUBLISHED_STORE_PATH`, default `published`) persists published,
playable trails as JSON files across restarts. Each published trail is an
**immutable snapshot** with embedded stops (no `content_cache` refs), reusing the
draft id, so `GET /trails/{draft_id}` plays exactly what was approved. Default
`memory` is in-process and published trails are lost on restart.

Drafts are stored as lightweight `DraftRecord` objects that hold only
`stop_refs: list[StopRef]` (each ref is a `stop_id` + `order`) rather than
embedding full stop content. On every `get` or `list_drafts` call the draft store
calls `_hydrate_draft`, which fetches each stop's content from the shared
`content_cache`. This means **editing a stop's content in the shared store
propagates automatically to every draft and trail that references that stop** —
no per-draft content duplication.

**Durability note** — restart-durable drafts require *both* stores to be
persistent: `TRAILQUEST_DRAFT_STORE=file` (persists stop refs) **and**
`TRAILQUEST_CONTENT_STORE=sqlite` (persists the stop content those refs point to).
Using `draft_store=file` with the default `content_store=memory` means the draft
records survive a restart but their content cannot be hydrated (the in-memory
content store is empty after restart).

**Walking routing** — `TRAILQUEST_ROUTING_PROVIDER=osrm` +
`TRAILQUEST_OSRM_URL=<osrm-foot-server>` measures distance over the walking
network and optimizes stop order via OSRM's `trip` service. Without it, a
haversine straight-line estimate is used.

**LLM provider** (`TRAILQUEST_LLM_PROVIDER`):

| Value | Auth | Notes |
|---|---|---|
| `stub` (default) | none | Deterministic offline echo; used by tests |
| `claude_cli` | **Claude Pro/Max subscription** | Shells out to the Claude Code CLI (`claude -p`) — no API key. Best for batch pre-generation. ⚠️ Using a personal subscription for automated/commercial backend generation may conflict with Anthropic's usage policies; the supported path for production scale is the Claude API. |
| `ollama` | none (local) | Calls a local Ollama server at `TRAILQUEST_OLLAMA_URL` |

`TRAILQUEST_LLM_MODEL` defaults to `claude-opus-4-8` (`claude-sonnet-4-6` is a
cheaper option); `TRAILQUEST_OLLAMA_MODEL` defaults to `llama3.1`.

Example — generate live Haarlem trails with subscription-backed content:

```bash
TRAILQUEST_POI_SOURCE=live \
TRAILQUEST_LLM_PROVIDER=claude_cli \
uvicorn app.main:app --reload
```

## Setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

## Commands

```bash
uvicorn app.main:app --reload   # run the API (docs at http://127.0.0.1:8000/docs)
pytest                          # run the test suite
pytest tests/test_trails_api.py::test_health   # run a single test
ruff check .                    # lint
ruff format .                   # format
mypy app                        # type-check
```

## Stop count control

`TrailRequest` (player, `POST /trails`) and `DraftCreate` (studio, `POST /drafts`) both accept an optional `desired_stops` field — an integer in the range **2–15**. When supplied it sets the target number of generated stops. The actual count is clamped to the number of POIs that carry verifiable facts (`has_verifiable_facts`), so the effective ceiling is always "however many grounded POIs are available". When `desired_stops` is omitted the route service derives a count from the requested distance (roughly one stop per kilometre, minimum 2).

This is enforced in `_select_pois` in `app/services/route_service.py`.

### Place-based concept creation

`DraftCreate` (`POST /drafts`) accepts an optional `place` (free-text town/place name). When
supplied it is geocoded via **Nominatim** (`app/clients/nominatim.py`, `TRAILQUEST_NOMINATIM_URL`)
into the draft's `start` coordinates and `city` label (fixing the previously hardcoded "Haarlem"
label). Resolution priority is `place > start > default-city coords`. A place that can't be
resolved (not found, or the geocoder is unreachable) raises a `ValueError` → **422** with a Dutch
message, so the studio form can show it and create nothing. For a geocoded place, the Haarlem-seed
fallback in `poi_service.candidates` is **disabled** (`allow_seed_fallback=False`) — a place with no
real OSM/Wikidata POIs yields a 422 ("Geen geschikte POI's gevonden…") rather than silently building
a trail from Haarlem seed stops (content-accuracy: never present non-local POIs as local). Requires
`TRAILQUEST_POI_SOURCE=live`.

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/trails` | Generate a full trail (route + content) on demand |
| `GET` | `/trails` | List published trails (the player browse list) |
| `GET` | `/trails/{id}` | Fetch a trail; resolves published trails first, then on-demand generated ones |
| `POST` | `/trails/{id}/answer` | Check answer for a stop; body: `stop_order`, `answer`, `attempt`, optional `question_index` (defaults to primary); resolves published or on-demand trails |
| `GET` | `/pois` | List candidate POIs near a location (query params: `lat`, `lon`, `distance_km`) |
| `POST` | `/routes/measure` | Compute walking distance/duration for an ordered list of coordinates |
| `POST` | `/drafts` | Create a draft trail; optional `place` (geocoded to `start`+`city`; 422 if not found), `start`, `distance_km`, `theme`, `desired_stops`, `from_concept` (generates real POIs + AI content) |
| `GET` | `/drafts` | List all draft trails |
| `GET` | `/drafts/{id}` | Fetch a single draft trail |
| `PUT` | `/drafts/{id}` | Update a draft trail (title, stops, status, etc.) |
| `PUT` | `/drafts/{id}/stops/{order}` | Save a stop's story, questions list, and primary_question_index; returns 422 if the primary question is a gating type (A or D) with no stored answer |
| `POST` | `/drafts/{id}/stops` | Add a custom stop to a draft; body: `name` (string, optional when `source_ref` is given), optional `lat`/`lon` (floats, default to the draft start if omitted), optional `source_ref` (Wikipedia/Wikidata link or bare QID — grounds the stop with Wikidata facts + Wikipedia background via `grounding_service`; degrades to a factless stop on any failure) |
| `POST` | `/drafts/{id}/stops/{order}/generate` | RAG-generate a grounded story and candidate question from the selected facts; body: `fact_keys` (list of fact key strings to ground the generation) and `tone` (optional string, e.g. `"speels"`) |
| `GET` | `/drafts/{id}/validation` | Pre-publish validation report: per-stop grounding checks, blocking/warning counts, and `can_publish` (true when `blocking == 0`) |
| `POST` | `/drafts/{id}/publish` | Self-publish: re-validates the draft; **409** if `blocking > 0`, otherwise snapshots it into a playable `Trail` (same id, immutable, stored in the published-trails registry), sets `status=published`, and returns the updated draft |

## Status

Working backend with the integrations wired in but **off by default**: live
OSM/Wikidata/Wikipedia POI retrieval (literal + reference-valued facts +
paraphrasable background), OSRM walking-network routing, a SQLite-backed content
store (version/source/review status), and Claude (subscription) / Ollama LLM
providers — all config-gated with offline fallbacks. Still ahead: a curation
review UI/workflow on top of the store's sampling hooks, batch pre-generation for
top cities, and the React Native client.

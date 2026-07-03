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
    wikipedia.py        paraphrasable narrative summary (Wikipedia)
    osrm.py             walking-network routing (OSRM trip service)
  services/
    route_service.py    POI selection + loop building + distance/duration
    poi_service.py      POI + fact retrieval (seed or live OSM/Wikidata)
    content_service.py  RAG pipeline: grounded story + question list, cached
    answer_service.py   gating: evaluate primary or bonus; 3 attempts then reveal, Dutch feedback
    gamification_service.py  points/bonuses
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

**Draft store** — `TRAILQUEST_DRAFT_STORE=file` (+ `TRAILQUEST_DRAFT_STORE_PATH`,
default `drafts`) persists creator-studio drafts as JSON files in a directory across restarts. Default
`memory` is in-process and drafts are lost on restart.

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

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/trails` | Generate a full trail (route + content) |
| `GET` | `/trails/{id}` | Fetch a persisted generated trail |
| `POST` | `/trails/{id}/answer` | Check answer for a stop; body: `stop_order`, `answer`, `attempt`, optional `question_index` (defaults to primary) |
| `GET` | `/pois` | List candidate POIs near a location (query params: `lat`, `lon`, `distance_km`) |
| `POST` | `/routes/measure` | Compute walking distance/duration for an ordered list of coordinates |
| `POST` | `/drafts` | Create a new draft trail |
| `GET` | `/drafts` | List all draft trails |
| `GET` | `/drafts/{id}` | Fetch a single draft trail |
| `PUT` | `/drafts/{id}` | Update a draft trail (title, stops, status, etc.) |
| `PUT` | `/drafts/{id}/stops/{order}` | Save a stop's story, questions list, and primary_question_index; returns 422 if the primary question is a gating type (A or D) with no stored answer |
| `POST` | `/drafts/{id}/stops` | Add a custom (non-catalog) factless stop to a draft; body: `name` (string), optional `lat`/`lon` (floats, default to the draft start if omitted) |
| `POST` | `/drafts/{id}/stops/{order}/generate` | RAG-generate a grounded story and candidate question from the selected facts; body: `fact_keys` (list of fact key strings to ground the generation) and `tone` (optional string, e.g. `"speels"`) |
| `GET` | `/drafts/{id}/validation` | Pre-publish validation report: per-stop grounding checks, blocking/warning counts, and `can_publish` (true when `blocking == 0`) |
| `POST` | `/drafts/{id}/publish` | Re-validates the draft; returns **409** if `blocking > 0`, otherwise sets `status=review` and returns the updated draft |

## Status

Working backend with the integrations wired in but **off by default**: live
OSM/Wikidata/Wikipedia POI retrieval (literal + reference-valued facts +
paraphrasable background), OSRM walking-network routing, a SQLite-backed content
store (version/source/review status), and Claude (subscription) / Ollama LLM
providers — all config-gated with offline fallbacks. Still ahead: a curation
review UI/workflow on top of the store's sampling hooks, batch pre-generation for
top cities, and the React Native client.

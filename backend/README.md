# TrailQuest backend

Python/FastAPI backend for TrailQuest (PRD §9.4). MVP is a **modular monolith**:
one stateless app whose modules map to the target services (route, POI/data,
content/RAG, gamification) so they can be split out later.

The domain model in `app/models/schemas.py` encodes the project's central
constraint (PRD §8): retrieved **ground truth** is kept separate from
LLM-**generated** text, and questions are classified A/B/C/D by verifiability so
only data-bound questions may gate progress.

## Layout

```
app/
  main.py               FastAPI app + router wiring
  config.py             env-driven settings (Haarlem defaults, providers)
  api/                  HTTP layer: health, trails (the end-to-end vertical)
  models/schemas.py     domain model + gating invariants
  clients/
    overpass.py         OSM POI retrieval (Overpass API)
    wikidata.py         structured-fact retrieval (Wikidata)
    osrm.py             walking-network routing (OSRM trip service)
  services/
    route_service.py    POI selection + loop building + distance/duration
    poi_service.py      POI + fact retrieval (seed or live OSM/Wikidata)
    content_service.py  RAG pipeline: grounded story + typed question, cached
    answer_service.py   gating: 3 attempts then reveal, honor system for Type B
    gamification_service.py  points/bonuses
    llm/provider.py     provider-agnostic LLM (stub / claude_cli / ollama)
  cache/store.py        content cache (POI × theme) + active-trail store
tests/                  pytest suite
```

## Data sources, routing, and the LLM (configurable)

Everything below defaults to **offline/stub** so the suite and a bare `uvicorn`
run need no network, keys, or models. Switch on real sources via env vars.

**POIs & facts** — `TRAILQUEST_POI_SOURCE=live` queries Overpass (OSM) for
Wikidata-linked POIs in range, then pulls structured facts (build year, height)
from Wikidata. Falls back to the bundled Haarlem seed set if Overpass fails.

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

## Status

Walking skeleton with the live integrations wired in but **off by default**:
live OSM/Wikidata POI retrieval, OSRM walking-network routing, and Claude
(subscription) / Ollama LLM providers all exist and are config-gated, with
offline fallbacks. Still stubbed: a persistent content store + cache (currently
in-memory), Wikipedia narrative enrichment, and reference-valued Wikidata facts
(architect, heritage status — they need a second label lookup).

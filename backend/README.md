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
  config.py             env-driven settings (Haarlem defaults, LLM provider)
  api/                  HTTP layer: health, trails (the end-to-end vertical)
  models/schemas.py     domain model + gating invariants
  services/
    route_service.py    POI selection + loop building + distance/duration
    poi_service.py      POI + fact retrieval (seed Haarlem data for now)
    content_service.py  RAG pipeline: grounded story + typed question, cached
    answer_service.py   gating: 3 attempts then reveal, honor system for Type B
    gamification_service.py  points/bonuses
    llm/provider.py     provider-agnostic LLM abstraction (stub by default)
  cache/store.py        content cache (POI × theme) + active-trail store
tests/                  pytest suite
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

Walking skeleton. Routing uses a straight-line distance placeholder (real impl:
OSRM/GraphHopper/Valhalla over the OSM walking network), POIs are a seed set for
Haarlem, and the LLM provider is a deterministic stub. These are marked in-code
and are the natural next pieces to flesh out.

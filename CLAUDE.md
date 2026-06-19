# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The product spec lives in `PRD.md` (Dutch); `README.md` and `LICENSE` (MIT) sit
alongside it. The first service — the **Python/FastAPI backend** — is scaffolded
under `backend/` as a walking skeleton (see `backend/README.md`). The mobile
client (React Native) is not built yet.

`backend/` is a **modular monolith**: each module under `app/services/` maps to a
target service from PRD §9.1 (route, POI/data, content/RAG, gamification) so it
can be split out later. The domain model in `backend/app/models/schemas.py`
encodes the content-accuracy constraint below — read it before touching content
or question logic.

**External integrations are config-gated and default to offline** so tests and a
bare run need no network/keys/models. Switch them on via env vars (see
`backend/README.md`):
- `TRAILQUEST_POI_SOURCE=live` — Overpass (OSM) + Wikidata (facts incl.
  reference-valued architect/heritage) + Wikipedia background, instead of the seed set.
- `TRAILQUEST_CONTENT_STORE=sqlite` (+ `TRAILQUEST_CONTENT_DB_PATH`) — persist
  generated stops (version/source/review status) so each (POI × theme) is
  generated once and reused; default `memory` is in-process.
- `TRAILQUEST_ROUTING_PROVIDER=osrm` (+ `TRAILQUEST_OSRM_URL`) — walking-network
  routing instead of the haversine estimate.
- `TRAILQUEST_LLM_PROVIDER=claude_cli|ollama` — `claude_cli` uses the **Claude
  Pro/Max subscription** via the Claude Code CLI (no API key; see the caveat in
  the README), `ollama` uses a local server. Default `stub` is an offline echo.

Outbound clients live in `app/clients/` and raise `ClientError`; services catch
it and fall back (seed POIs, haversine) — degrade rather than break (PRD §13).

### Backend commands (run from `backend/`)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"          # install with dev tools
uvicorn app.main:app --reload    # run API (docs at /docs)
pytest                           # full test suite
pytest tests/test_trails_api.py::test_health   # single test
ruff check . && ruff format --check .          # lint + format
mypy app                         # type-check
```

CI (`.github/workflows/backend.yml`) runs ruff, format check, mypy, and pytest on
backend changes. Keep all four green.

## What the product is

TrailQuest generates personalized, interactive walking scavenger hunts ("speurtochten")
from a start location, distance, and theme. The user is led between points of
interest (POIs) and gets a story plus a puzzle/question at each stop; solving it
unlocks the next stop. See `PRD.md` for the full spec.

## The central constraint (read before writing any content/AI code)

The defining engineering problem is **content accuracy**, not route-building.
An LLM must never invent verifiable facts and must never judge an answer it
cannot actually verify. This shapes the whole content pipeline (`PRD.md` §8):

- **Strict separation of two content types:**
  1. *Ground truth (retrieved):* verifiable facts (build year, height, architect,
     protected status) pulled from Wikidata / OSM tags / Wikipedia. This is the
     source of truth.
  2. *Generated text (LLM):* story, tone, riddle phrasing. The LLM **rephrases**
     ground truth via RAG — it is instructed to use only the supplied facts,
     invent nothing, and omit anything missing. Every factual claim keeps a
     source reference.

- **Question types are classified by verifiability**, and only some may *gate*
  progress to the next stop:
  - **Type A — data-bound** (e.g. tower height from Wikidata): question is
    generated *from* the known answer. **May gate.**
  - **Type B — observe/count** (e.g. "how many lions above the door?"): the
    system cannot verify this. **Must not gate** in MVP — use honor-system only
    (ask, then reveal without a fail path).
  - **Type C — open/reflection:** no right/wrong. **Always let through.**
  - **Type D — riddle whose solution is a Type-A fact.** **May gate.**

  MVP automatic gating is allowed only on **A, C, D**. This rule is the reason the
  retrieved/generated split exists — do not let generated content become a gate.

- If a POI lacks verifiable facts, skip it or use a non-factual story. Prefer no
  stop over a wrong stop.

## Planned architecture (PRD §9)

Server-side generation; the mobile client never runs the LLM. Services are
intended to be stateless + cache-backed so pre-generation can run as batch.

- **Client (mobile):** React Native *or* Flutter (undecided — see open questions).
  Map, navigation, geofencing, content display, and a **local cache of the active
  trail** so it keeps working when connectivity drops.
- **API / gateway:** auth, rate limiting, orchestration.
- **Route service:** POI selection + routing over the *walking* network
  (OSRM / GraphHopper / Valhalla). Distance must be measured over the path
  network, not as-the-crow-flies; routes are loops (start ≈ end).
- **POI / data service:** fetch + normalize POIs and facts from OSM / Wikidata /
  Wikipedia, with its own cache.
- **Content service:** the RAG pipeline that generates/serves story + facts +
  questions per (POI × theme), writing to the content store.
- **Content store + cache:** generated content keyed by **(POI × theme)** with
  version, source, and review status.
- **Gamification / user service:** points, badges, completed trails, history.

**Cost model matters (§9.3):** generate per (POI × theme) **once** and reuse
across all users; pre-generate for top cities/POIs; only the long tail is
on-demand (with stricter grounding). The key cost driver to watch is *number of
generations*, not sessions — caching is where the margin is.

**Backend stack (§9.4):** Python/FastAPI is preferred for the AI/RAG and data
pipelines; Node.js is an option for a realtime/gateway layer.

**Model layer (§8.4):** keep a provider-agnostic abstraction so the LLM provider
(Claude, GPT, Gemini) can be swapped on quality/cost/latency. When building the
AI features, default to the latest Claude models.

## Data sources & licensing (PRD §10) — affects code, not just legal

- **OpenStreetMap** (POIs, walking network, routing): ODbL — **attribution is
  required**; mind derived-data terms.
- **Wikidata** (structured facts): CC0 — free; the intended ground truth for
  Type-A questions.
- **Wikipedia** (narrative background): CC BY-SA — attribution + share-alike;
  **paraphrase, don't copy** text.
- **Mapbox / Google Maps** (tiles, geocoding): optional, commercial, usage limits.

Carry source attribution through the data model from ingestion to display.

## Resolved decisions (PRD §19) — build to these

These were previously open; they are now settled. Don't re-litigate them.

- **Auth:** **Guest mode** — playable without an account. Tie gamification/history
  to an optional account the user can create later.
- **First launch city:** **Haarlem.** Focus content investment and GTM here.
- **Frontend:** **React Native** (single iOS/Android codebase). Pick map,
  geofencing, and cache libraries from the RN ecosystem.
- **Map stack:** start on a **free tier (e.g. Google Maps)** for tiles/geocoding;
  watch usage limits. OSM remains the source for POIs and walking-network routing.
- **Gating:** **3 attempts**, then reveal the answer and continue. **Stops are not
  skippable** — progress is linear.
- **Curation:** **pure AI + sampling** in MVP (no per-POI human-in-the-loop).
  Sample-based review plus the per-stop feedback button feed corrections.
- **Input mode:** **distance-based only** in MVP. Time-based input is roadmap.
- **Monetization:** **consumer-first** (freemium); explore B2B/B2G later.

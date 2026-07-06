"""Application configuration via environment variables (12-factor)."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the repo root (backend/app/config.py -> repo root), so
# settings load regardless of the working directory the server is started from
# (e.g. `cd backend && uvicorn ...`). A missing file is ignored. Real environment
# variables still take precedence (tests force offline defaults via conftest).
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TRAILQUEST_", env_file=str(_ENV_FILE), extra="ignore"
    )

    app_name: str = "TrailQuest"
    environment: str = "development"

    # First launch city (PRD §19). Coordinates are the Haarlem city centre.
    default_city: str = "Haarlem"
    default_city_lat: float = 52.3812
    default_city_lon: float = 4.6361

    # LLM provider abstraction (PRD §8.4). Provider-agnostic; defaults to a stub
    # so the skeleton runs with no network/keys.
    #   "stub"       — deterministic offline echo (tests/CI)
    #   "claude_cli" — Claude Code CLI headless mode; uses your Claude Pro/Max
    #                  subscription (no API key). See app/services/llm/provider.py.
    #   "ollama"     — local Ollama HTTP server.
    llm_provider: str = "stub"
    # Default to the latest Claude model; "claude-sonnet-4-6" is a cheaper option.
    llm_model: str = "claude-opus-4-8"
    # Path to the Claude Code CLI (used by the claude_cli provider).
    claude_cli_path: str = "claude"
    # Local Ollama server + model (used by the ollama provider).
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:27b"

    # Content store + cache (PRD §9.1, §9.3). "memory" is in-process (tests);
    # "sqlite" persists generated content (with version/source/review status) so
    # generation happens once and survives restarts.
    content_store: str = "memory"
    content_db_path: str = "trailquest_content.db"

    # Studio draft trails. "memory" (default, tests) is in-process; "file"
    # persists each draft as JSON under draft_store_path so drafts survive restarts.
    draft_store: str = "memory"
    draft_store_path: str = "drafts"

    # Published trail store. "memory" (default, tests) is in-process; "file"
    # persists each published trail as JSON under published_store_path.
    published_store: str = "memory"
    published_store_path: str = "published"

    # POI / data source (PRD §10). "seed" uses the bundled Haarlem set (offline,
    # used by tests); "live" queries Overpass (OSM) + Wikidata.
    poi_source: str = "seed"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    wikidata_api_url: str = "https://www.wikidata.org/w/api.php"
    # Paraphrasable Wikipedia background for live POIs (CC BY-SA, attributed).
    enrich_wikipedia: bool = True

    # Geocoding (place name → coordinates) via Nominatim (OpenStreetMap, ODbL).
    # No API key required; usage policy requires a descriptive User-Agent.
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"

    # Walking-network routing (PRD §7.3). "none" falls back to a straight-line
    # estimate; "osrm" uses an OSRM-compatible server with the foot profile.
    routing_provider: str = "none"
    osrm_url: str = "https://routing.openstreetmap.de/routed-foot"

    # Shared HTTP timeout (seconds) for outbound data/routing calls.
    http_timeout: float = 30.0

    # Walking pace + per-stop reading/puzzle time, used for duration estimates (PRD §7.3).
    walking_speed_kmh: float = 4.5
    minutes_per_stop: int = 5


settings = Settings()

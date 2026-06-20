"""Application configuration via environment variables (12-factor)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TRAILQUEST_", env_file=".env", extra="ignore")

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

    # POI / data source (PRD §10). "seed" uses the bundled Haarlem set (offline,
    # used by tests); "live" queries Overpass (OSM) + Wikidata.
    poi_source: str = "seed"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    wikidata_api_url: str = "https://www.wikidata.org/w/api.php"
    # Paraphrasable Wikipedia background for live POIs (CC BY-SA, attributed).
    enrich_wikipedia: bool = True

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

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
    # so the skeleton runs with no API keys. Swap to "claude" once wired up.
    llm_provider: str = "stub"
    llm_model: str = "claude-opus-4-8"

    # Walking pace + per-stop reading/puzzle time, used for duration estimates (PRD §7.3).
    walking_speed_kmh: float = 4.5
    minutes_per_stop: int = 5


settings = Settings()

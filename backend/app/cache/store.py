"""Content store keyed by (POI × theme).

The key cost driver is the *number of generations*, not sessions: generate per
(POI × theme) once and reuse across all users (PRD §9.3). This in-memory cache
is a stand-in for that store; swap for a persistent backend (with version,
source, and review status per entry) later.
"""

from __future__ import annotations

from app.models.schemas import Stop, Theme, Trail


class ContentCache:
    def __init__(self) -> None:
        self._store: dict[tuple[str, Theme], Stop] = {}

    @staticmethod
    def _key(poi_id: str, theme: Theme) -> tuple[str, Theme]:
        return (poi_id, theme)

    def get(self, poi_id: str, theme: Theme) -> Stop | None:
        return self._store.get(self._key(poi_id, theme))

    def put(self, poi_id: str, theme: Theme, stop: Stop) -> None:
        self._store[self._key(poi_id, theme)] = stop

    def clear(self) -> None:
        self._store.clear()


content_cache = ContentCache()


class ActiveTrailStore:
    """In-memory registry of generated trails so a session can answer questions.

    A real deployment keeps the active trail on the device (local cache, PRD §11)
    and/or in a session store; this stand-in just holds them in process memory.
    """

    def __init__(self) -> None:
        self._trails: dict[str, Trail] = {}

    def put(self, trail: Trail) -> None:
        self._trails[trail.id] = trail

    def get(self, trail_id: str) -> Trail | None:
        return self._trails.get(trail_id)

    def clear(self) -> None:
        self._trails.clear()


active_trails = ActiveTrailStore()

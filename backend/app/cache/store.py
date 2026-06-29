"""Content store keyed by (POI × theme), plus the active-trail registry.

The key cost driver is the *number of generations*, not sessions: generate per
(POI × theme) once and reuse across all users (PRD §9.3). The content store
persists generated stops with **version**, **source**, and **review status** per
entry (PRD §9.1) so generation survives restarts and supports the curation
sampling described in PRD §8.3.

Two backends, selected by ``settings.content_store``:
- ``"memory"`` (default) — in-process dict; used by tests.
- ``"sqlite"`` — a single-file SQLite database at ``settings.content_db_path``.
"""

from __future__ import annotations

import sqlite3
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.models.schemas import DraftTrail, Stop, Theme, Trail

# Review status of a cached entry (PRD §8.3: AI + sampling). MVP serves
# unreviewed content; the curation layer flips entries to approved/rejected.
ReviewStatus = str  # "unreviewed" | "approved" | "rejected"


@dataclass(frozen=True)
class ContentEntry:
    poi_id: str
    theme: Theme
    version: int
    stop: Stop
    source: str  # e.g. "claude_cli:claude-opus-4-8" or "stub"
    review_status: ReviewStatus
    created_at: str  # ISO 8601


class ContentStore(ABC):
    """Persistent cache of generated stops keyed by (POI × theme)."""

    @abstractmethod
    def get(self, poi_id: str, theme: Theme) -> Stop | None:
        """Return the latest cached stop for (poi_id, theme), if any."""

    @abstractmethod
    def put(
        self,
        poi_id: str,
        theme: Theme,
        stop: Stop,
        *,
        source: str = "",
        review_status: ReviewStatus = "unreviewed",
    ) -> int:
        """Store a new version of the stop and return its version number."""

    @abstractmethod
    def sample_unreviewed(self, limit: int = 20) -> list[ContentEntry]:
        """Return up to ``limit`` unreviewed entries for human spot-checking."""

    @abstractmethod
    def set_review_status(
        self, poi_id: str, theme: Theme, version: int, status: ReviewStatus
    ) -> None:
        """Flag a specific cached version as approved/rejected (curation layer)."""

    @abstractmethod
    def clear(self) -> None:
        """Drop all entries (used by tests)."""


class InMemoryContentStore(ContentStore):
    def __init__(self) -> None:
        self._entries: dict[tuple[str, Theme], list[ContentEntry]] = {}

    def get(self, poi_id: str, theme: Theme) -> Stop | None:
        versions = self._entries.get((poi_id, theme))
        return versions[-1].stop if versions else None

    def put(
        self,
        poi_id: str,
        theme: Theme,
        stop: Stop,
        *,
        source: str = "",
        review_status: ReviewStatus = "unreviewed",
    ) -> int:
        versions = self._entries.setdefault((poi_id, theme), [])
        version = len(versions) + 1
        versions.append(ContentEntry(poi_id, theme, version, stop, source, review_status, _now()))
        return version

    def sample_unreviewed(self, limit: int = 20) -> list[ContentEntry]:
        out: list[ContentEntry] = []
        for versions in self._entries.values():
            out.extend(e for e in versions if e.review_status == "unreviewed")
        return out[:limit]

    def set_review_status(
        self, poi_id: str, theme: Theme, version: int, status: ReviewStatus
    ) -> None:
        for i, entry in enumerate(self._entries.get((poi_id, theme), [])):
            if entry.version == version:
                self._entries[(poi_id, theme)][i] = ContentEntry(
                    poi_id, theme, version, entry.stop, entry.source, status, entry.created_at
                )
                return

    def clear(self) -> None:
        self._entries.clear()


class SqliteContentStore(ContentStore):
    """SQLite-backed store. One row per (poi_id, theme, version)."""

    def __init__(self, db_path: str) -> None:
        # check_same_thread=False + a lock keeps it safe under the dev server's
        # threadpool without a per-request connection.
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS content (
                poi_id        TEXT NOT NULL,
                theme         TEXT NOT NULL,
                version       INTEGER NOT NULL,
                content_json  TEXT NOT NULL,
                source        TEXT NOT NULL,
                review_status TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                PRIMARY KEY (poi_id, theme, version)
            )
            """
        )
        self._conn.commit()

    def get(self, poi_id: str, theme: Theme) -> Stop | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT content_json FROM content WHERE poi_id=? AND theme=? "
                "ORDER BY version DESC LIMIT 1",
                (poi_id, theme.value),
            ).fetchone()
        return Stop.model_validate_json(row[0]) if row else None

    def put(
        self,
        poi_id: str,
        theme: Theme,
        stop: Stop,
        *,
        source: str = "",
        review_status: ReviewStatus = "unreviewed",
    ) -> int:
        with self._lock:
            (max_version,) = self._conn.execute(
                "SELECT COALESCE(MAX(version), 0) FROM content WHERE poi_id=? AND theme=?",
                (poi_id, theme.value),
            ).fetchone()
            version = int(max_version) + 1
            self._conn.execute(
                "INSERT INTO content VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    poi_id,
                    theme.value,
                    version,
                    stop.model_dump_json(),
                    source,
                    review_status,
                    _now(),
                ),
            )
            self._conn.commit()
        return version

    def sample_unreviewed(self, limit: int = 20) -> list[ContentEntry]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT poi_id, theme, version, content_json, source, review_status, created_at "
                "FROM content WHERE review_status='unreviewed' ORDER BY created_at LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            ContentEntry(r[0], Theme(r[1]), r[2], Stop.model_validate_json(r[3]), r[4], r[5], r[6])
            for r in rows
        ]

    def set_review_status(
        self, poi_id: str, theme: Theme, version: int, status: ReviewStatus
    ) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE content SET review_status=? WHERE poi_id=? AND theme=? AND version=?",
                (status, poi_id, theme.value, version),
            )
            self._conn.commit()

    def clear(self) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM content")
            self._conn.commit()


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _build_content_store() -> ContentStore:
    if settings.content_store == "sqlite":
        return SqliteContentStore(settings.content_db_path)
    return InMemoryContentStore()


content_cache: ContentStore = _build_content_store()


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


class DraftStore(ABC):
    """Registry of creator draft trails."""

    @abstractmethod
    def put(self, draft: DraftTrail) -> None: ...

    @abstractmethod
    def get(self, draft_id: str) -> DraftTrail | None: ...

    @abstractmethod
    def list_drafts(self) -> list[DraftTrail]: ...

    @abstractmethod
    def clear(self) -> None: ...


class InMemoryDraftStore(DraftStore):
    def __init__(self) -> None:
        self._drafts: dict[str, DraftTrail] = {}

    def put(self, draft: DraftTrail) -> None:
        self._drafts[draft.id] = draft

    def get(self, draft_id: str) -> DraftTrail | None:
        return self._drafts.get(draft_id)

    def list_drafts(self) -> list[DraftTrail]:
        return list(self._drafts.values())

    def clear(self) -> None:
        self._drafts.clear()


class FileDraftStore(DraftStore):
    """Persist each draft as ``<id>.json`` under a directory (survives restarts)."""

    def __init__(self, dir_path: str) -> None:
        self._dir = Path(dir_path)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, draft_id: str) -> Path:
        return self._dir / f"{Path(draft_id).name}.json"  # .name guards path traversal

    def put(self, draft: DraftTrail) -> None:
        self._path(draft.id).write_text(draft.model_dump_json(indent=2), encoding="utf-8")

    def get(self, draft_id: str) -> DraftTrail | None:
        path = self._path(draft_id)
        if not path.exists():
            return None
        return DraftTrail.model_validate_json(path.read_text(encoding="utf-8"))

    def list_drafts(self) -> list[DraftTrail]:
        out: list[DraftTrail] = []
        for f in sorted(self._dir.glob("*.json")):
            out.append(DraftTrail.model_validate_json(f.read_text(encoding="utf-8")))
        return out

    def clear(self) -> None:
        for f in self._dir.glob("*.json"):
            f.unlink()


def _build_draft_store() -> DraftStore:
    if settings.draft_store == "file":
        return FileDraftStore(settings.draft_store_path)
    return InMemoryDraftStore()


drafts: DraftStore = _build_draft_store()

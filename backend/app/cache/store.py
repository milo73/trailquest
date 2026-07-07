"""Stop store keyed by ``stop_id`` (= ``"{poi_id}::{theme}"``), plus the
active-trail registry and draft store.

The key cost driver is the *number of generations*, not sessions: generate per
(POI × theme) once and reuse across all users (PRD §9.3). The stop store persists
generated stop content (``StopContent``) with **version**, **source**, and
**review status** per entry (PRD §9.1) so generation survives restarts and
supports the curation sampling described in PRD §8.3.

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

from pydantic import BaseModel

from app.config import settings
from app.models.schemas import (
    DraftStatus,
    DraftStop,
    DraftTrail,
    GeoPoint,
    StopContent,
    StopRef,
    Theme,
    Trail,
    stop_id_for,
)

# Review status of a cached entry (PRD §8.3: AI + sampling). MVP serves
# unreviewed content; the curation layer flips entries to approved/rejected.
ReviewStatus = str  # "unreviewed" | "approved" | "rejected"


@dataclass(frozen=True)
class ContentEntry:
    stop_id: str
    version: int
    content: StopContent
    source: str  # e.g. "claude_cli:claude-opus-4-8" or "stub"
    review_status: ReviewStatus
    created_at: str  # ISO 8601


class ContentStore(ABC):
    """Persistent cache of generated stop content keyed by ``stop_id``."""

    @abstractmethod
    def get(self, stop_id: str) -> StopContent | None:
        """Return the latest cached content for *stop_id*, if any."""

    @abstractmethod
    def put(
        self,
        stop_id: str,
        content: StopContent,
        *,
        source: str = "",
        review_status: ReviewStatus = "unreviewed",
    ) -> int:
        """Store a new version of the content and return its version number."""

    @abstractmethod
    def sample_unreviewed(self, limit: int = 20) -> list[ContentEntry]:
        """Return up to ``limit`` unreviewed entries for human spot-checking."""

    @abstractmethod
    def set_review_status(self, stop_id: str, version: int, status: ReviewStatus) -> None:
        """Flag a specific cached version as approved/rejected (curation layer)."""

    @abstractmethod
    def clear(self) -> None:
        """Drop all entries (used by tests)."""

    def get_for(self, poi_id: str, theme: Theme) -> StopContent | None:
        """Convenience wrapper: ``get(stop_id_for(poi_id, theme))``."""
        return self.get(stop_id_for(poi_id, theme))


class InMemoryContentStore(ContentStore):
    def __init__(self) -> None:
        self._entries: dict[str, list[ContentEntry]] = {}

    def get(self, stop_id: str) -> StopContent | None:
        versions = self._entries.get(stop_id)
        return versions[-1].content if versions else None

    def put(
        self,
        stop_id: str,
        content: StopContent,
        *,
        source: str = "",
        review_status: ReviewStatus = "unreviewed",
    ) -> int:
        versions = self._entries.setdefault(stop_id, [])
        version = len(versions) + 1
        versions.append(ContentEntry(stop_id, version, content, source, review_status, _now()))
        return version

    def sample_unreviewed(self, limit: int = 20) -> list[ContentEntry]:
        out: list[ContentEntry] = []
        for versions in self._entries.values():
            out.extend(e for e in versions if e.review_status == "unreviewed")
        return out[:limit]

    def set_review_status(self, stop_id: str, version: int, status: ReviewStatus) -> None:
        for i, entry in enumerate(self._entries.get(stop_id, [])):
            if entry.version == version:
                self._entries[stop_id][i] = ContentEntry(
                    stop_id, version, entry.content, entry.source, status, entry.created_at
                )
                return

    def clear(self) -> None:
        self._entries.clear()


class SqliteContentStore(ContentStore):
    """SQLite-backed store. One row per (stop_id, version)."""

    def __init__(self, db_path: str) -> None:
        # check_same_thread=False + a lock keeps it safe under the dev server's
        # threadpool without a per-request connection.
        self._lock = threading.Lock()
        # Create the parent directory if the path points into one (mirrors
        # FileDraftStore); a bare filename resolves to "." and is a no-op.
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS content (
                stop_id       TEXT NOT NULL,
                version       INTEGER NOT NULL,
                content_json  TEXT NOT NULL,
                source        TEXT NOT NULL,
                review_status TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                PRIMARY KEY (stop_id, version)
            )
            """
        )
        self._conn.commit()

    def get(self, stop_id: str) -> StopContent | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT content_json FROM content WHERE stop_id=? ORDER BY version DESC LIMIT 1",
                (stop_id,),
            ).fetchone()
        return StopContent.model_validate_json(row[0]) if row else None

    def put(
        self,
        stop_id: str,
        content: StopContent,
        *,
        source: str = "",
        review_status: ReviewStatus = "unreviewed",
    ) -> int:
        with self._lock:
            (max_version,) = self._conn.execute(
                "SELECT COALESCE(MAX(version), 0) FROM content WHERE stop_id=?",
                (stop_id,),
            ).fetchone()
            version = int(max_version) + 1
            self._conn.execute(
                "INSERT INTO content VALUES (?, ?, ?, ?, ?, ?)",
                (
                    stop_id,
                    version,
                    content.model_dump_json(),
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
                "SELECT stop_id, version, content_json, source, review_status, created_at "
                "FROM content WHERE review_status='unreviewed' ORDER BY created_at LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            ContentEntry(r[0], r[1], StopContent.model_validate_json(r[2]), r[3], r[4], r[5])
            for r in rows
        ]

    def set_review_status(self, stop_id: str, version: int, status: ReviewStatus) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE content SET review_status=? WHERE stop_id=? AND version=?",
                (status, stop_id, version),
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


class DraftRecord(BaseModel):
    """Lightweight draft metadata that stores stop refs instead of embedded content.

    Each stop's content is stored in the shared ``content_cache`` keyed by
    ``stop_id``, so edits to a stop propagate to every draft that references it.
    """

    id: str
    title: str
    city: str
    theme: Theme
    start: GeoPoint
    requested_distance_km: float
    actual_distance_km: float
    estimated_duration_min: int
    status: DraftStatus
    attributions: list[str]
    stop_refs: list[StopRef]


def _has_content(c: StopContent) -> bool:
    """Return True if *c* carries real authored content (story or questions)."""
    return bool(c.story and c.story.strip()) or len(c.questions) > 0


def _normalize_draft(draft: DraftTrail) -> DraftRecord:
    """Extract stop content into ``content_cache`` and return a ref-only record.

    Write rule: a freshly-added/empty stop must NEVER overwrite existing authored
    content for the same stop_id.  Only write when:
    - there is no existing entry (first time this POI×theme is seen), OR
    - the incoming content differs AND is non-empty (has a story or ≥1 question).
    This prevents a bare DraftStop (no story/questions) from silently clobbering
    content authored by another draft that shares the same stop_id.
    """
    refs: list[StopRef] = []
    for s in draft.stops:
        sid = stop_id_for(s.poi.id, draft.theme)
        s.id = sid  # response-ready id
        content = StopContent(
            poi=s.poi,
            story=s.story,
            questions=s.questions,
            primary_question_index=s.primary_question_index,
        )
        latest = content_cache.get(sid)
        if latest is None:
            # First time this stop_id is seen — store unconditionally (even if
            # empty) so the ref hydrates and POI metadata is available.
            content_cache.put(sid, content, source="draft")
        elif content != latest and _has_content(content):
            # Only upgrade: a non-empty edit propagates; empty/bare stops never
            # downgrade existing authored content.
            content_cache.put(sid, content, source="draft")
        refs.append(StopRef(stop_id=sid, order=s.order))
    return DraftRecord(
        id=draft.id,
        title=draft.title,
        city=draft.city,
        theme=draft.theme,
        start=draft.start,
        requested_distance_km=draft.requested_distance_km,
        actual_distance_km=draft.actual_distance_km,
        estimated_duration_min=draft.estimated_duration_min,
        status=draft.status,
        attributions=draft.attributions,
        stop_refs=refs,
    )


def _hydrate_draft(record: DraftRecord) -> DraftTrail:
    """Reconstruct a ``DraftTrail`` by fetching each stop's content from the cache."""
    stops: list[DraftStop] = []
    for ref in record.stop_refs:
        content = content_cache.get(ref.stop_id)
        if content is None:
            # Only fires under FileDraftStore + in-memory-content on restart
            # (see README durability note on store coupling).
            continue
        stops.append(
            DraftStop(
                id=ref.stop_id,
                order=ref.order,
                poi=content.poi,
                story=content.story,
                questions=content.questions,
                primary_question_index=content.primary_question_index,
            )
        )
    return DraftTrail(
        id=record.id,
        title=record.title,
        city=record.city,
        theme=record.theme,
        start=record.start,
        requested_distance_km=record.requested_distance_km,
        actual_distance_km=record.actual_distance_km,
        estimated_duration_min=record.estimated_duration_min,
        status=record.status,
        attributions=record.attributions,
        stops=stops,
    )


class DraftStore(ABC):
    """Registry of creator draft trails."""

    @abstractmethod
    def put(self, draft: DraftTrail) -> None: ...

    @abstractmethod
    def get(self, draft_id: str) -> DraftTrail | None: ...

    @abstractmethod
    def list_drafts(self) -> list[DraftTrail]: ...

    @abstractmethod
    def delete(self, draft_id: str) -> bool: ...

    @abstractmethod
    def clear(self) -> None: ...


class InMemoryDraftStore(DraftStore):
    def __init__(self) -> None:
        self._records: dict[str, DraftRecord] = {}

    def put(self, draft: DraftTrail) -> None:
        self._records[draft.id] = _normalize_draft(draft)

    def get(self, draft_id: str) -> DraftTrail | None:
        rec = self._records.get(draft_id)
        return _hydrate_draft(rec) if rec is not None else None

    def list_drafts(self) -> list[DraftTrail]:
        return [_hydrate_draft(rec) for rec in self._records.values()]

    def delete(self, draft_id: str) -> bool:
        return self._records.pop(draft_id, None) is not None

    def clear(self) -> None:
        self._records.clear()


class FileDraftStore(DraftStore):
    """Persist each draft as ``<id>.json`` under a directory (survives restarts).

    Writes a ``DraftRecord`` (refs-only) so stop content is never duplicated;
    hydration reads from the shared ``content_cache``.
    """

    def __init__(self, dir_path: str) -> None:
        self._dir = Path(dir_path)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, draft_id: str) -> Path:
        return self._dir / f"{Path(draft_id).name}.json"  # .name guards path traversal

    def put(self, draft: DraftTrail) -> None:
        rec = _normalize_draft(draft)
        self._path(draft.id).write_text(rec.model_dump_json(indent=2), encoding="utf-8")

    def get(self, draft_id: str) -> DraftTrail | None:
        path = self._path(draft_id)
        if not path.exists():
            return None
        rec = DraftRecord.model_validate_json(path.read_text(encoding="utf-8"))
        return _hydrate_draft(rec)

    def list_drafts(self) -> list[DraftTrail]:
        out: list[DraftTrail] = []
        for f in sorted(self._dir.glob("*.json")):
            rec = DraftRecord.model_validate_json(f.read_text(encoding="utf-8"))
            out.append(_hydrate_draft(rec))
        return out

    def delete(self, draft_id: str) -> bool:
        path = self._path(draft_id)
        if not path.exists():
            return False
        path.unlink()
        return True

    def clear(self) -> None:
        for f in self._dir.glob("*.json"):
            f.unlink()


def _build_draft_store() -> DraftStore:
    if settings.draft_store == "file":
        return FileDraftStore(settings.draft_store_path)
    return InMemoryDraftStore()


drafts: DraftStore = _build_draft_store()


class PublishedTrailStore(ABC):
    """Registry of published, playable trails (immutable snapshots)."""

    @abstractmethod
    def put(self, trail: Trail) -> None: ...
    @abstractmethod
    def get(self, trail_id: str) -> Trail | None: ...
    @abstractmethod
    def list_trails(self) -> list[Trail]: ...
    @abstractmethod
    def clear(self) -> None: ...


class InMemoryPublishedTrailStore(PublishedTrailStore):
    def __init__(self) -> None:
        self._trails: dict[str, Trail] = {}

    def put(self, trail: Trail) -> None:
        self._trails[trail.id] = trail

    def get(self, trail_id: str) -> Trail | None:
        return self._trails.get(trail_id)

    def list_trails(self) -> list[Trail]:
        return list(self._trails.values())

    def clear(self) -> None:
        self._trails.clear()


class FilePublishedTrailStore(PublishedTrailStore):
    """Persist each published trail as ``<id>.json`` (survives restarts)."""

    def __init__(self, dir_path: str) -> None:
        self._dir = Path(dir_path)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, trail_id: str) -> Path:
        return self._dir / f"{Path(trail_id).name}.json"

    def put(self, trail: Trail) -> None:
        self._path(trail.id).write_text(trail.model_dump_json(indent=2), encoding="utf-8")

    def get(self, trail_id: str) -> Trail | None:
        path = self._path(trail_id)
        if not path.exists():
            return None
        return Trail.model_validate_json(path.read_text(encoding="utf-8"))

    def list_trails(self) -> list[Trail]:
        return [
            Trail.model_validate_json(f.read_text(encoding="utf-8"))
            for f in sorted(self._dir.glob("*.json"))
        ]

    def clear(self) -> None:
        for f in self._dir.glob("*.json"):
            f.unlink()


def _build_published_store() -> PublishedTrailStore:
    if settings.published_store == "file":
        return FilePublishedTrailStore(settings.published_store_path)
    return InMemoryPublishedTrailStore()


published_trails: PublishedTrailStore = _build_published_store()

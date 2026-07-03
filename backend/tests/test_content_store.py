"""Tests for the persistent stop store and content-service caching."""

from __future__ import annotations

import pytest

from app.cache.store import InMemoryContentStore, SqliteContentStore
from app.models.schemas import (
    POI,
    Fact,
    GeoPoint,
    Question,
    QuestionType,
    Source,
    SourceLicense,
    StopContent,
    Theme,
    stop_id_for,
)


def _content(story: str = "A grounded story.") -> StopContent:
    poi = POI(id="node/1", name="Grote Kerk", location=GeoPoint(lat=52.38, lon=4.63))
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="What stood here?")
    return StopContent(poi=poi, story=story, questions=[q], primary_question_index=0)


@pytest.fixture(params=["memory", "sqlite"])
def store(request: pytest.FixtureRequest, tmp_path) -> object:
    if request.param == "sqlite":
        return SqliteContentStore(str(tmp_path / "content.db"))
    return InMemoryContentStore()


def test_put_then_get_roundtrips_the_content(store) -> None:
    sid = stop_id_for("node/1", Theme.HISTORICAL)
    store.put(sid, _content(story="Built in 1370."), source="stub:x")
    got = store.get(sid)
    assert got is not None and got.story == "Built in 1370."


def test_get_returns_latest_version(store) -> None:
    sid = stop_id_for("node/1", Theme.HISTORICAL)
    assert store.put(sid, _content(story="v1")) == 1
    assert store.put(sid, _content(story="v2")) == 2
    assert store.get(sid).story == "v2"


def test_miss_returns_none(store) -> None:
    assert store.get(stop_id_for("nope", Theme.MIXED)) is None


def test_review_sampling_and_status(store) -> None:
    sid = stop_id_for("node/1", Theme.HISTORICAL)
    store.put(sid, _content(), source="stub:x")
    sample = store.sample_unreviewed()
    assert len(sample) == 1 and sample[0].review_status == "unreviewed"
    store.set_review_status(sid, version=1, status="approved")
    assert store.sample_unreviewed() == []


def test_get_for_convenience(store) -> None:
    store.put(stop_id_for("node/1", Theme.NATURE), _content(story="via get_for"))
    got = store.get_for("node/1", Theme.NATURE)
    assert got is not None and got.story == "via get_for"


def test_sqlite_persists_across_connections(tmp_path) -> None:
    path = str(tmp_path / "content.db")
    sid = stop_id_for("node/1", Theme.NATURE)
    SqliteContentStore(path).put(sid, _content(story="persisted"))
    # A fresh connection (simulating a restart) still sees the content.
    assert SqliteContentStore(path).get(sid).story == "persisted"


def test_content_service_caches_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    """build_stop should generate once and serve the cache on the second call."""
    from app.services import content_service
    from app.services.llm import provider

    calls = {"n": 0}
    real_rephrase = provider.StubProvider.rephrase

    def counting_rephrase(self, **kwargs):  # type: ignore[no-untyped-def]
        calls["n"] += 1
        return real_rephrase(self, **kwargs)

    monkeypatch.setattr(provider.StubProvider, "rephrase", counting_rephrase)

    poi = POI(id="node/9", name="Place", location=GeoPoint(lat=52.0, lon=4.0))
    content_service.build_stop(poi, Theme.MIXED, order=1)
    content_service.build_stop(poi, Theme.MIXED, order=5)  # cache hit
    assert calls["n"] == 1  # generated only once


def test_build_stop_degrades_when_llm_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    """An LLM provider failure must degrade, not break, and must not poison the cache.

    On a RuntimeError from the provider (offline/timeout/CLI missing), build_stop
    serves a deterministic, still-grounded story (PRD §13) and does NOT cache it,
    so a later run can regenerate with the real provider (PRD §9.3).
    """
    from app.cache.store import content_cache
    from app.models.schemas import stop_id_for as sid_for
    from app.services import content_service
    from app.services.llm.provider import LLMProvider

    content_cache.clear()

    class FailingProvider(LLMProvider):
        def complete(self, *, system: str, prompt: str) -> str:
            raise RuntimeError("Ollama request failed: timed out")

    # The configured provider fails the way a live one would (timeout); the
    # deterministic StubProvider fallback stays intact.
    monkeypatch.setattr(content_service, "get_llm_provider", lambda: FailingProvider())
    monkeypatch.setattr(content_service.settings, "llm_provider", "ollama")

    fact = Fact(
        key="build_year",
        value="1779",
        source=Source(name="Wikidata", license=SourceLicense.CC0, reference="wikidata:Q1"),
    )
    poi = POI(id="node/42", name="Molen", location=GeoPoint(lat=52.0, lon=4.0), facts=[fact])

    stop = content_service.build_stop(poi, Theme.HISTORICAL, order=1)

    assert "1779" in stop.story  # grounded fallback, not a 500
    assert content_cache.get(sid_for("node/42", Theme.HISTORICAL)) is None  # not cached

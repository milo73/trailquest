"""Tests for the persistent content store and content-service caching."""

from __future__ import annotations

import pytest

from app.cache.store import InMemoryContentStore, SqliteContentStore
from app.models.schemas import POI, GeoPoint, Question, QuestionType, Stop, Theme


def _stop(order: int = 1, story: str = "A grounded story.") -> Stop:
    poi = POI(id="node/1", name="Grote Kerk", location=GeoPoint(lat=52.38, lon=4.63))
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="What stood here?")
    return Stop(order=order, poi=poi, story=story, question=q)


@pytest.fixture(params=["memory", "sqlite"])
def store(request: pytest.FixtureRequest, tmp_path) -> object:
    if request.param == "sqlite":
        return SqliteContentStore(str(tmp_path / "content.db"))
    return InMemoryContentStore()


def test_put_then_get_roundtrips_the_stop(store) -> None:
    store.put("node/1", Theme.HISTORICAL, _stop(story="Built in 1370."), source="stub:x")
    got = store.get("node/1", Theme.HISTORICAL)
    assert got is not None and got.story == "Built in 1370."


def test_get_returns_latest_version(store) -> None:
    assert store.put("node/1", Theme.HISTORICAL, _stop(story="v1")) == 1
    assert store.put("node/1", Theme.HISTORICAL, _stop(story="v2")) == 2
    assert store.get("node/1", Theme.HISTORICAL).story == "v2"


def test_miss_returns_none(store) -> None:
    assert store.get("nope", Theme.MIXED) is None


def test_review_sampling_and_status(store) -> None:
    store.put("node/1", Theme.HISTORICAL, _stop(), source="stub:x")
    sample = store.sample_unreviewed()
    assert len(sample) == 1 and sample[0].review_status == "unreviewed"
    store.set_review_status("node/1", Theme.HISTORICAL, version=1, status="approved")
    assert store.sample_unreviewed() == []


def test_sqlite_persists_across_connections(tmp_path) -> None:
    path = str(tmp_path / "content.db")
    SqliteContentStore(path).put("node/1", Theme.NATURE, _stop(story="persisted"))
    # A fresh connection (simulating a restart) still sees the content.
    assert SqliteContentStore(path).get("node/1", Theme.NATURE).story == "persisted"


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

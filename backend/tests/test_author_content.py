from app.cache.store import content_cache
from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense, Theme, stop_id_for
from app.services import content_service


def _poi() -> POI:
    return POI(
        id="p1",
        name="Sint-Bavokerk",
        location=GeoPoint(lat=52.38, lon=4.63),
        facts=[
            Fact(
                key="height_m",
                value="78",
                source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"),
            )
        ],
    )


def test_author_content_grounds_in_facts_and_builds_question():
    content_cache.clear()
    story, questions, primary_index, degraded = content_service.author_content(
        _poi(), Theme.HISTORICAL, tone="speels"
    )
    assert "78" in story  # grounded in the supplied fact (stub echoes facts offline)
    primary = questions[primary_index]
    assert primary.type == "A"  # height_m is a data-bound template
    assert primary.answer == "78"
    assert degraded is True  # the stub provider is configured under tests


def test_author_content_degraded_false_with_a_real_provider(monkeypatch):
    from app.services.llm.provider import LLMProvider

    class RealProvider(LLMProvider):
        def complete(self, *, system: str, prompt: str) -> str:
            return "Een rijk, geparafraseerd verhaal."

    monkeypatch.setattr(content_service, "get_llm_provider", lambda: RealProvider())
    story, _questions, _primary, degraded = content_service.author_content(_poi(), Theme.HISTORICAL)
    assert degraded is False
    assert story == "Een rijk, geparafraseerd verhaal."


def test_author_content_degraded_true_when_provider_fails(monkeypatch):
    from app.services.llm.provider import LLMProvider

    class FailingProvider(LLMProvider):
        def complete(self, *, system: str, prompt: str) -> str:
            raise RuntimeError("Claude CLI timed out")

    monkeypatch.setattr(content_service, "get_llm_provider", lambda: FailingProvider())
    story, _questions, _primary, degraded = content_service.author_content(_poi(), Theme.HISTORICAL)
    assert degraded is True  # fell back to the stub
    assert "78" in story


def test_author_content_does_not_touch_the_cache():
    content_cache.clear()
    content_service.author_content(_poi(), Theme.HISTORICAL)
    assert content_cache.get(stop_id_for("p1", Theme.HISTORICAL)) is None  # no cache write

from app.cache.store import content_cache
from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense, Theme
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
    story, question = content_service.author_content(_poi(), Theme.HISTORICAL, tone="speels")
    assert "78" in story  # grounded in the supplied fact (stub echoes facts offline)
    assert question.type == "A"  # height_m is a data-bound template
    assert question.answer == "78"


def test_author_content_does_not_touch_the_cache():
    content_cache.clear()
    content_service.author_content(_poi(), Theme.HISTORICAL)
    assert content_cache.get("p1", Theme.HISTORICAL) is None  # no cache write

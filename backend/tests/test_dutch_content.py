from app.models.schemas import POI, Fact, GeoPoint, Source, SourceLicense, Theme
from app.services.content_service import _build_question
from app.services.llm.provider import StubProvider


def _poi(*, facts: bool) -> POI:
    fs = (
        [
            Fact(
                key="height_m",
                value="78",
                source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"),
            )
        ]
        if facts
        else []
    )
    return POI(id="p1", name="Sint-Bavokerk", location=GeoPoint(lat=52.38, lon=4.63), facts=fs)


def test_data_bound_question_is_dutch():
    q = _build_question(_poi(facts=True))
    assert q.type == "A"
    assert q.answer == "78"
    assert "Hoe hoog" in q.prompt  # Dutch template
    assert q.hint is not None and "hoogte" in q.hint


def test_reflection_question_is_dutch():
    q = _build_question(_poi(facts=False))
    assert q.type == "C"
    assert "Kijk eens rond" in q.prompt


def test_stub_factless_story_is_dutch():
    story = StubProvider().rephrase(poi_name="Plein", theme=Theme.MIXED, facts=[])
    assert story == "Plein is onderdeel van je speurtocht."

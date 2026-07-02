from app.models.schemas import POI, Fact, GeoPoint, QuestionType, Source, SourceLicense
from app.services.content_service import _build_questions


def _fact(key: str, value: str) -> Fact:
    return Fact(
        key=key,
        value=value,
        source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"),
    )


def test_multi_fact_poi_yields_data_bound_plus_reflection():
    poi = POI(
        id="p",
        name="Toren",
        location=GeoPoint(lat=52.0, lon=4.0),
        facts=[_fact("height_m", "78"), _fact("build_year", "1520")],
    )
    questions, primary = _build_questions(poi)
    assert primary == 0
    assert [q.type for q in questions] == [
        QuestionType.DATA_BOUND,
        QuestionType.DATA_BOUND,
        QuestionType.OPEN_REFLECTION,
    ]
    assert questions[0].answer == "78"


def test_no_data_bound_fact_yields_reflection_primary():
    poi = POI(id="p", name="Plein", location=GeoPoint(lat=52.0, lon=4.0))
    questions, primary = _build_questions(poi)
    assert primary == 0
    assert [q.type for q in questions] == [QuestionType.OPEN_REFLECTION]

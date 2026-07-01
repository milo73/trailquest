from app.models.schemas import (
    POI,
    DraftStop,
    DraftTrail,
    Fact,
    GeoPoint,
    Question,
    QuestionType,
    Source,
    SourceLicense,
)
from app.services import draft_service


def _fact() -> Fact:
    return Fact(
        key="height_m",
        value="78",
        source=Source(name="Wikidata", license=SourceLicense.CC0, reference="q1"),
    )


def _stop(order: int, *, facts: bool = True, content: bool = True) -> DraftStop:
    poi = POI(
        id=f"p{order}",
        name=f"Stop {order}",
        location=GeoPoint(lat=52.38, lon=4.63),
        facts=[_fact()] if facts else [],
    )
    q = Question(type=QuestionType.OPEN_REFLECTION, prompt="?") if content else None
    return DraftStop(order=order, poi=poi, story="Een verhaal." if content else None, question=q)


def _draft(stops, *, requested=5.0, actual=5.0) -> DraftTrail:
    return DraftTrail(
        id="d1",
        title="t",
        city="Haarlem",
        theme="historical",
        start=GeoPoint(lat=52.38, lon=4.63),
        requested_distance_km=requested,
        actual_distance_km=actual,
        estimated_duration_min=60,
        stops=stops,
    )


def test_complete_grounded_intolerance_draft_can_publish():
    result = draft_service.validate(_draft([_stop(1), _stop(2)]))
    assert result.can_publish is True
    assert result.blocking == 0
    assert all(s.grounded for s in result.per_stop)


def test_too_few_stops_blocks():
    result = draft_service.validate(_draft([_stop(1)]))
    assert result.can_publish is False
    assert any(c.id == "stops" and c.status == "blocking" for c in result.checks)


def test_factless_stop_blocks_grounding():
    result = draft_service.validate(_draft([_stop(1), _stop(2, facts=False)]))
    assert result.can_publish is False
    assert any(c.id == "grounding" and c.status == "blocking" for c in result.checks)
    assert result.per_stop[1].grounded is False
    assert result.per_stop[1].sources == "geen feiten"


def test_incomplete_content_blocks():
    result = draft_service.validate(_draft([_stop(1), _stop(2, content=False)]))
    assert result.can_publish is False
    assert any(c.id == "content" and c.status == "blocking" for c in result.checks)


def test_distance_out_of_tolerance_is_a_warning_not_blocking():
    result = draft_service.validate(_draft([_stop(1), _stop(2)], requested=5.0, actual=9.0))
    assert result.can_publish is True  # warning only
    assert result.warnings >= 1
    assert any(c.id == "distance" and c.status == "warning" for c in result.checks)

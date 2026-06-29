from app.models.schemas import (
    POI,
    DraftCreate,
    DraftStop,
    DraftTrail,
    GeoPoint,
)


def _poi() -> POI:
    return POI(id="p1", name="Grote Markt", location=GeoPoint(lat=52.38, lon=4.63))


def test_draft_stop_content_is_optional():
    stop = DraftStop(order=1, poi=_poi())
    assert stop.story is None
    assert stop.question is None


def test_draft_trail_defaults_to_concept():
    draft = DraftTrail(
        id="d1",
        title="Nieuwe tocht",
        city="Haarlem",
        theme="historical",
        start=GeoPoint(lat=52.38, lon=4.63),
        requested_distance_km=5,
        actual_distance_km=0,
        estimated_duration_min=0,
        stops=[DraftStop(order=1, poi=_poi())],
    )
    assert draft.status == "concept"
    assert draft.attributions == []


def test_draft_create_defaults():
    req = DraftCreate(start=GeoPoint(lat=52.38, lon=4.63))
    assert req.distance_km == 5
    assert req.theme == "mixed"
    assert req.from_concept is False
    assert req.title is None

from app.cache.store import InMemoryPublishedTrailStore
from app.models.schemas import (
    POI, DraftStop, DraftTrail, GeoPoint, Question, QuestionType, Theme, Trail,
)
from app.services import draft_service


def _draft() -> DraftTrail:
    poi = POI(id="p1", name="Grote Kerk", location=GeoPoint(lat=52.38, lon=4.63))
    q = Question(type=QuestionType.DATA_BOUND, prompt="Hoe hoog?", answer="78")
    stop = DraftStop(id="p1::historical", order=1, poi=poi, story="Een verhaal.",
                     questions=[q], primary_question_index=0)
    return DraftTrail(id="d1", title="t", city="Haarlem", theme=Theme.HISTORICAL,
                      start=GeoPoint(lat=52.38, lon=4.63), requested_distance_km=5,
                      actual_distance_km=4.8, estimated_duration_min=60, stops=[stop, stop],
                      attributions=["Wikidata (CC0)"])


def test_to_trail_reuses_id_and_converts_stops():
    trail = draft_service.to_trail(_draft())
    assert isinstance(trail, Trail)
    assert trail.id == "d1"  # reuses the draft id
    assert trail.city == "Haarlem" and trail.theme == Theme.HISTORICAL
    assert trail.actual_distance_km == 4.8
    assert len(trail.stops) == 2
    s = trail.stops[0]
    assert s.story == "Een verhaal." and s.questions[0].answer == "78" and s.primary_question_index == 0
    assert trail.attributions == ["Wikidata (CC0)"]


def test_published_store_roundtrip():
    store = InMemoryPublishedTrailStore()
    trail = draft_service.to_trail(_draft())
    assert store.get("d1") is None
    store.put(trail)
    assert store.get("d1").id == "d1"
    assert [t.id for t in store.list_trails()] == ["d1"]

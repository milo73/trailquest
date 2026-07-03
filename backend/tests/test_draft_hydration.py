from app.cache.store import InMemoryDraftStore, content_cache
from app.models.schemas import (
    POI,
    DraftStop,
    DraftTrail,
    GeoPoint,
    Question,
    QuestionType,
    Theme,
)


def _draft(draft_id: str, poi: POI) -> DraftTrail:
    return DraftTrail(
        id=draft_id,
        title="t",
        city="Haarlem",
        theme=Theme.HISTORICAL,
        start=GeoPoint(lat=52.0, lon=4.0),
        requested_distance_km=5,
        actual_distance_km=1,
        estimated_duration_min=10,
        stops=[
            DraftStop(
                order=1,
                poi=poi,
                story="oud verhaal",
                questions=[Question(type=QuestionType.DATA_BOUND, prompt="?", answer="1")],
                primary_question_index=0,
            )
        ],
    )


def test_put_sets_stop_id_and_get_hydrates():
    content_cache.clear()
    store = InMemoryDraftStore()
    poi = POI(id="grote-markt", name="Grote Markt", location=GeoPoint(lat=52.0, lon=4.0))
    store.put(_draft("d1", poi))
    got = store.get("d1")
    assert got is not None
    assert got.stops[0].id == "grote-markt::historical"
    assert got.stops[0].story == "oud verhaal"


def test_edit_in_one_draft_propagates_to_another_sharing_the_stop():
    content_cache.clear()
    store = InMemoryDraftStore()
    poi = POI(id="grote-markt", name="Grote Markt", location=GeoPoint(lat=52.0, lon=4.0))
    store.put(_draft("A", poi))
    store.put(_draft("B", poi))  # both reference grote-markt::historical

    a = store.get("A")
    a.stops[0].story = "nieuw verhaal"
    store.put(a)

    b = store.get("B")
    assert b.stops[0].story == "nieuw verhaal"  # edit propagated via the shared stop store

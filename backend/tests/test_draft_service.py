import pytest

from app.cache.store import drafts
from app.models.schemas import DraftCreate, DraftUpdate, GeoPoint
from app.services import draft_service, poi_service

HAARLEM = GeoPoint(lat=52.3812, lon=4.6361)


@pytest.fixture(autouse=True)
def _clear_drafts():
    drafts.clear()
    yield
    drafts.clear()


def test_create_blank_draft_is_empty_and_persisted():
    d = draft_service.create(DraftCreate(start=HAARLEM, title="Mijn tocht"))
    assert d.title == "Mijn tocht"
    assert d.stops == []
    assert d.actual_distance_km == 0.0
    assert draft_service.get(d.id).id == d.id
    assert d.id in {x.id for x in draft_service.list_drafts()}


def test_create_from_concept_has_stops():
    d = draft_service.create(DraftCreate(start=HAARLEM, theme="historical", from_concept=True))
    assert len(d.stops) >= 1
    assert d.actual_distance_km > 0


def test_update_adds_stops_recomputes_distance_and_attributions():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    candidate_ids = [p.id for p in poi_service.candidates(HAARLEM, 5)][:2]
    updated = draft_service.update(d.id, DraftUpdate(stop_poi_ids=candidate_ids))
    assert [s.poi.id for s in updated.stops] == candidate_ids
    assert [s.order for s in updated.stops] == [1, 2]
    assert updated.actual_distance_km > 0
    assert updated.attributions  # non-empty once grounded stops are present


def test_update_reorder_and_remove():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    ids = [p.id for p in poi_service.candidates(HAARLEM, 5)][:2]
    draft_service.update(d.id, DraftUpdate(stop_poi_ids=ids))
    reordered = draft_service.update(d.id, DraftUpdate(stop_poi_ids=list(reversed(ids))))
    assert [s.poi.id for s in reordered.stops] == list(reversed(ids))
    removed = draft_service.update(d.id, DraftUpdate(stop_poi_ids=[ids[0]]))
    assert [s.poi.id for s in removed.stops] == [ids[0]]


def test_update_unknown_draft_returns_none():
    assert draft_service.update("nope", DraftUpdate(title="x")) is None


def test_update_skips_unknown_poi_id():
    d = draft_service.create(DraftCreate(start=HAARLEM))
    updated = draft_service.update(d.id, DraftUpdate(stop_poi_ids=["does-not-exist"]))
    assert updated.stops == []

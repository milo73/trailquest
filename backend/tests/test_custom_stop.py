import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app
from app.models.schemas import DraftCreate, GeoPoint
from app.services import draft_service

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def test_add_custom_stop_appends_factless_stop_and_defaults_coords():
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    updated = draft_service.add_custom_stop(d.id, name="Mijn plek")
    assert updated.stops[-1].poi.name == "Mijn plek"
    assert updated.stops[-1].poi.facts == []
    assert updated.stops[-1].poi.id.startswith("custom:")
    # coords default to the draft start when omitted
    assert updated.stops[-1].poi.location.lat == HAARLEM["lat"]
    assert updated.stops[-1].order == len(updated.stops)


def test_add_custom_stop_unknown_draft_returns_none():
    assert draft_service.add_custom_stop("nope", name="x") is None


def test_post_custom_stop_endpoint_roundtrip_and_404():
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    r = client.post(
        f"/drafts/{d.id}/stops",
        json={"name": "Verzonnen stop", "lat": 52.39, "lon": 4.64},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["stops"][-1]["poi"]["name"] == "Verzonnen stop"
    assert body["stops"][-1]["poi"]["location"]["lat"] == 52.39
    assert client.post("/drafts/nope/stops", json={"name": "x"}).status_code == 404


def test_add_custom_stop_with_source_ref_is_grounded(monkeypatch):
    from app.clients import wikidata
    from app.clients.wikidata import EntityData
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service

    monkeypatch.setattr(
        wikidata,
        "fetch_entity",
        lambda qid: EntityData(facts={"build_year": "1520"}, enwiki_title=None),
    )
    # avoid a real Wikipedia call for background (enwiki_title=None already skips it)
    draft = draft_service.create(DraftCreate(start=GeoPoint(lat=52.38, lon=4.63)))
    updated = draft_service.add_custom_stop(draft.id, name="Mijn plek", source_ref="Q42")
    assert updated is not None
    stop = updated.stops[-1]
    assert stop.poi.id == "wikidata:Q42"
    assert stop.poi.facts and stop.poi.facts[0].key == "build_year"


def test_add_custom_stop_without_source_ref_is_factless(monkeypatch):
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service

    draft = draft_service.create(DraftCreate(start=GeoPoint(lat=52.38, lon=4.63)))
    updated = draft_service.add_custom_stop(draft.id, name="Leeg")
    assert updated.stops[-1].poi.facts == [] and updated.stops[-1].poi.id.startswith("custom:")

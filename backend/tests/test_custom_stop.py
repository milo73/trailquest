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

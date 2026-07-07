import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def test_create_get_list_roundtrip():
    created = client.post("/drafts", json={"start": HAARLEM, "title": "Mijn tocht"})
    assert created.status_code == 201
    draft_id = created.json()["id"]
    assert created.json()["title"] == "Mijn tocht"

    got = client.get(f"/drafts/{draft_id}")
    assert got.status_code == 200
    assert got.json()["id"] == draft_id

    listed = client.get("/drafts")
    assert listed.status_code == 200
    assert draft_id in {d["id"] for d in listed.json()}


def test_update_changes_title():
    draft_id = client.post("/drafts", json={"start": HAARLEM}).json()["id"]
    r = client.put(f"/drafts/{draft_id}", json={"title": "Hernoemd"})
    assert r.status_code == 200
    assert r.json()["title"] == "Hernoemd"


def test_get_unknown_is_404():
    assert client.get("/drafts/nope").status_code == 404


def test_update_unknown_is_404():
    assert client.put("/drafts/nope", json={"title": "x"}).status_code == 404


def test_create_with_unknown_place_returns_422(monkeypatch):
    from app.clients import nominatim

    monkeypatch.setattr(nominatim, "geocode", lambda q: None)
    r = client.post("/drafts", json={"place": "Nergensland"})
    assert r.status_code == 422
    assert "niet gevonden" in r.json()["detail"]


def test_delete_draft_removes_it():
    d = client.post("/drafts", json={"start": {"lat": 52.3812, "lon": 4.6361}}).json()
    assert client.delete(f"/drafts/{d['id']}").status_code == 204
    assert client.get(f"/drafts/{d['id']}").status_code == 404


def test_delete_unknown_draft_is_404():
    assert client.delete("/drafts/nope").status_code == 404


def test_delete_draft_keeps_published_trail_playable(monkeypatch):
    from app.models.schemas import DraftCreate, GeoPoint
    from app.services import draft_service

    d = draft_service.create(
        DraftCreate(start=GeoPoint(lat=52.3812, lon=4.6361), from_concept=True)
    )
    assert client.post(f"/drafts/{d.id}/publish").status_code == 200
    assert client.delete(f"/drafts/{d.id}").status_code == 204
    # the published snapshot is immutable — still playable after the draft is gone
    assert client.get(f"/trails/{d.id}").status_code == 200

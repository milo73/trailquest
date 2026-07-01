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


def _publishable_draft_id() -> str:
    # from_concept builds grounded stops with story+question; ≥2 stops near Haarlem
    d = draft_service.create(
        DraftCreate(start=GeoPoint(**HAARLEM), theme="historical", from_concept=True)
    )
    return d.id


def test_get_validation_shape():
    draft_id = _publishable_draft_id()
    r = client.get(f"/drafts/{draft_id}/validation")
    assert r.status_code == 200
    body = r.json()
    assert {"checks", "per_stop", "blocking", "warnings", "can_publish"} <= set(body.keys())


def test_publish_success_sets_review():
    draft_id = _publishable_draft_id()
    # ensure it is publishable (concept generation grounds + fills content)
    assert client.get(f"/drafts/{draft_id}/validation").json()["can_publish"] is True
    r = client.post(f"/drafts/{draft_id}/publish")
    assert r.status_code == 200
    assert r.json()["status"] == "review"
    assert client.get(f"/drafts/{draft_id}").json()["status"] == "review"


def test_publish_blocked_is_409():
    # a blank draft has 0 stops → blocking
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    r = client.post(f"/drafts/{d.id}/publish")
    assert r.status_code == 409
    # status unchanged
    assert client.get(f"/drafts/{d.id}").json()["status"] == "concept"


def test_publish_and_validation_unknown_are_404():
    assert client.get("/drafts/nope/validation").status_code == 404
    assert client.post("/drafts/nope/publish").status_code == 404

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import DraftCreate, GeoPoint
from app.services import draft_service

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


def _publishable_draft_id() -> str:
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM), from_concept=True))
    return d.id


def test_publish_creates_a_playable_trail():
    did = _publishable_draft_id()
    assert client.get(f"/drafts/{did}/validation").json()["can_publish"] is True
    r = client.post(f"/drafts/{did}/publish")
    assert r.status_code == 200 and r.json()["status"] == "published"
    # the published trail is now playable by the same id
    got = client.get(f"/trails/{did}")
    assert got.status_code == 200 and got.json()["id"] == did and len(got.json()["stops"]) >= 2
    # and it appears in the published list
    listed = client.get("/trails").json()
    assert did in [t["id"] for t in listed]


def test_publish_blocking_draft_is_409_and_creates_no_trail():
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))  # 0 stops → blocking
    assert client.post(f"/drafts/{d.id}/publish").status_code == 409
    assert client.get(f"/trails/{d.id}").status_code == 404


def test_answer_resolves_a_published_trail():
    did = _publishable_draft_id()
    client.post(f"/drafts/{did}/publish")
    trail = client.get(f"/trails/{did}").json()
    order = trail["stops"][0]["order"]
    r = client.post(
        f"/trails/{did}/answer", json={"stop_order": order, "answer": "x", "attempt": 1}
    )
    assert r.status_code == 200  # resolves the published trail (not only active_trails)


def test_get_validation_shape():
    did = _publishable_draft_id()
    r = client.get(f"/drafts/{did}/validation")
    assert r.status_code == 200
    assert {"checks", "per_stop", "blocking", "warnings", "can_publish"} <= set(r.json().keys())


def test_publish_and_validation_unknown_are_404():
    assert client.get("/drafts/nope/validation").status_code == 404
    assert client.post("/drafts/nope/publish").status_code == 404

import pytest
from fastapi.testclient import TestClient

from app.cache.store import drafts
from app.main import app
from app.models.schemas import DraftCreate, DraftUpdate, GeoPoint
from app.services import draft_service, poi_service

client = TestClient(app)
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


@pytest.fixture(autouse=True)
def _clear():
    drafts.clear()
    yield
    drafts.clear()


def _draft_with_one_stop() -> str:
    d = draft_service.create(DraftCreate(start=GeoPoint(**HAARLEM)))
    poi_id = poi_service.candidates(GeoPoint(**HAARLEM), 5)[0].id
    draft_service.update(d.id, DraftUpdate(stop_poi_ids=[poi_id]))
    return d.id


def test_put_stop_content_persists_and_generate_roundtrip():
    draft_id = _draft_with_one_stop()
    gen = client.post(f"/drafts/{draft_id}/stops/1/generate", json={"tone": "speels"})
    assert gen.status_code == 200
    body = gen.json()
    assert body["story"] and body["question"]["type"]

    put = client.put(
        f"/drafts/{draft_id}/stops/1",
        json={"story": body["story"], "question": body["question"]},
    )
    assert put.status_code == 200
    assert client.get(f"/drafts/{draft_id}").json()["stops"][0]["story"] == body["story"]


def test_put_stop_content_invalid_gating_question_is_422():
    draft_id = _draft_with_one_stop()
    # Type A with no answer violates the Question gating invariant → 422
    r = client.put(
        f"/drafts/{draft_id}/stops/1",
        json={"question": {"type": "A", "prompt": "Hoe hoog?"}},
    )
    assert r.status_code == 422


def test_stop_content_unknown_is_404():
    assert client.put("/drafts/nope/stops/1", json={"story": "x"}).status_code == 404
    assert client.post("/drafts/nope/stops/1/generate", json={}).status_code == 404

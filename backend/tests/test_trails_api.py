"""End-to-end tests for the trail generation vertical."""

from __future__ import annotations

from fastapi.testclient import TestClient

# Haarlem city centre — the seed POIs sit nearby.
HAARLEM = {"lat": 52.3812, "lon": 4.6361}


def test_health(client: TestClient) -> None:
    assert client.get("/health").json()["status"] == "ok"


def test_generate_trail_is_a_loop_with_grounded_stops(client: TestClient) -> None:
    resp = client.post("/trails", json={"start": HAARLEM, "distance_km": 5, "theme": "historical"})
    assert resp.status_code == 201
    trail = resp.json()

    assert trail["city"] == "Haarlem"
    assert len(trail["stops"]) >= 2
    # Every stop carries a story and a question.
    for stop in trail["stops"]:
        assert stop["story"]
        assert stop["questions"][stop["primary_question_index"]]["prompt"]
    # Fact-less POIs are skipped (prefer no stop over a wrong stop).
    names = [s["poi"]["name"] for s in trail["stops"]]
    assert "Grote Markt" not in names
    # Source attribution is carried through (OSM is always present).
    assert any("OpenStreetMap" in a for a in trail["attributions"])


def test_generated_question_from_fact_can_be_answered(client: TestClient) -> None:
    trail = client.post("/trails", json={"start": HAARLEM, "distance_km": 3}).json()
    # Find a data-bound (gating) stop and answer it correctly.
    gating = next(s for s in trail["stops"] if s["questions"][s["primary_question_index"]]["gates"])
    answer = gating["questions"][gating["primary_question_index"]]["answer"]
    resp = client.post(
        f"/trails/{trail['id']}/answer",
        json={"stop_order": gating["order"], "answer": answer, "attempt": 1},
    )
    body = resp.json()
    assert body["correct"] and body["unlocked_next"]


def test_distance_bounds_are_enforced(client: TestClient) -> None:
    assert client.post("/trails", json={"start": HAARLEM, "distance_km": 0.5}).status_code == 422
    assert client.post("/trails", json={"start": HAARLEM, "distance_km": 99}).status_code == 422


def test_answer_unknown_trail_is_404(client: TestClient) -> None:
    resp = client.post("/trails/nope/answer", json={"stop_order": 1, "answer": "x", "attempt": 1})
    assert resp.status_code == 404

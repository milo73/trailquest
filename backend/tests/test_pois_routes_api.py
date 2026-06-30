from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_pois_returns_seed_candidates_near_haarlem():
    r = client.get("/pois", params={"lat": 52.3812, "lon": 4.6361, "distance_km": 5})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    assert {"id", "name", "location"} <= set(body[0].keys())


def test_measure_route_returns_distance_and_duration():
    r = client.post(
        "/routes/measure",
        json={
            "start": {"lat": 52.380, "lon": 4.630},
            "points": [{"lat": 52.385, "lon": 4.640}, {"lat": 52.390, "lon": 4.650}],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["distance_km"] > 0
    assert body["duration_min"] > 0


def test_measure_route_empty_points_is_zero():
    r = client.post("/routes/measure", json={"start": {"lat": 52.38, "lon": 4.63}, "points": []})
    assert r.json() == {"distance_km": 0.0, "duration_min": 0}

"""Tests for route_service geometry wiring (Task 2)."""

from app.clients import osrm
from app.clients.osrm import TripResult
from app.models.schemas import GeoPoint, Theme, TrailRequest
from app.services import route_service


def test_generate_trail_has_route_geometry_with_osrm(monkeypatch):
    monkeypatch.setattr(route_service.settings, "routing_provider", "osrm")
    monkeypatch.setattr(
        osrm,
        "optimized_loop",
        lambda pts: TripResult(
            order=list(range(len(pts))),
            distance_km=2.0,
            geometry=[(52.38, 4.63), (52.39, 4.64)],
        ),
    )
    trail = route_service.generate_trail(
        TrailRequest(start=GeoPoint(lat=52.38, lon=4.63), distance_km=3, theme=Theme.MIXED)
    )
    assert trail.route_geometry is not None
    assert trail.route_geometry[0].lat == 52.38 and trail.route_geometry[0].lon == 4.63


def test_generate_trail_route_geometry_none_on_haversine(monkeypatch):
    monkeypatch.setattr(route_service.settings, "routing_provider", "haversine")
    trail = route_service.generate_trail(
        TrailRequest(start=GeoPoint(lat=52.38, lon=4.63), distance_km=3, theme=Theme.MIXED)
    )
    assert trail.route_geometry is None

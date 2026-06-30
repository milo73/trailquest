"""Route service (PRD §7.3, §9.1).

Selects POIs and builds a loop (start ≈ end). Distance is measured over the
*walking* network via OSRM when ``routing_provider == "osrm"`` (PRD §7.3); the
OSRM `trip` service also optimizes the stop order. Without a routing server it
falls back to a straight-line (haversine) nearest-neighbour loop — a usable
estimate, clearly marked, that over/under-states real walking distance.
"""

from __future__ import annotations

import logging
import uuid
from math import asin, cos, radians, sin, sqrt

from app.clients import ClientError, osrm
from app.config import settings
from app.models.schemas import (
    POI,
    GeoPoint,
    Theme,
    Trail,
    TrailRequest,
)
from app.services import content_service, poi_service

logger = logging.getLogger(__name__)


def _haversine_km(a: GeoPoint, b: GeoPoint) -> float:
    r = 6371.0
    dlat, dlon = radians(b.lat - a.lat), radians(b.lon - a.lon)
    h = sin(dlat / 2) ** 2 + cos(radians(a.lat)) * cos(radians(b.lat)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(h))


def _nearest_neighbour_loop(start: GeoPoint, pois: list[POI]) -> list[POI]:
    """Order POIs as a greedy loop starting and ending near ``start``."""
    remaining = list(pois)
    ordered: list[POI] = []
    cursor = start
    while remaining:
        nxt = min(remaining, key=lambda p: _haversine_km(cursor, p.location))
        ordered.append(nxt)
        remaining.remove(nxt)
        cursor = nxt.location
    return ordered


def _loop_distance_km(start: GeoPoint, ordered: list[POI]) -> float:
    if not ordered:
        return 0.0
    points = [start, *[p.location for p in ordered], start]  # loop back to start
    return sum(_haversine_km(points[i], points[i + 1]) for i in range(len(points) - 1))


def measure_loop(start: GeoPoint, ordered_points: list[GeoPoint]) -> tuple[float, int]:
    """Measure a loop (start → points → start) in the given order.

    The creator controls stop order, so this does NOT reorder. Distance is the
    haversine loop estimate; duration adds walking time plus per-stop time.
    Returns ``(distance_km, duration_min)``.
    """
    if not ordered_points:
        return 0.0, 0
    points = [start, *ordered_points, start]
    distance = round(
        sum(_haversine_km(points[i], points[i + 1]) for i in range(len(points) - 1)), 2
    )
    walk_min = (distance / settings.walking_speed_kmh) * 60
    duration = round(walk_min + len(ordered_points) * settings.minutes_per_stop)
    return distance, duration


def _order_and_measure(start: GeoPoint, selected: list[POI]) -> tuple[list[POI], float]:
    """Order stops into a loop and return (ordered_pois, loop_distance_km).

    Uses OSRM's walking-network `trip` service when configured, falling back to
    the haversine nearest-neighbour estimate on any routing failure.
    """
    if not selected:
        return [], 0.0

    if settings.routing_provider == "osrm":
        try:
            points = [(start.lat, start.lon), *[(p.location.lat, p.location.lon) for p in selected]]
            trip = osrm.optimized_loop(points)
            # trip.order is over points (index 0 == start); map the rest to POIs.
            ordered = [selected[i - 1] for i in trip.order if i != 0]
            return ordered, trip.distance_km
        except ClientError as exc:
            logger.warning("OSRM routing failed (%s); using haversine estimate", exc)

    ordered = _nearest_neighbour_loop(start, selected)
    return ordered, round(_loop_distance_km(start, ordered), 2)


def _select_pois(candidates: list[POI], distance_km: float) -> list[POI]:
    """Pick POIs with verifiable facts, roughly one stop per kilometre.

    Prefer no stop over a wrong stop: fact-less POIs are dropped (PRD §8.3, §13).
    """
    with_facts = [p for p in candidates if p.has_verifiable_facts]
    target_stops = max(2, round(distance_km))
    return with_facts[:target_stops]


def generate_trail(req: TrailRequest) -> Trail:
    """Generate a full trail for the request (the thin end-to-end vertical)."""
    candidates = poi_service.candidates(req.start, req.distance_km)
    selected = _select_pois(candidates, req.distance_km)
    ordered, actual_km = _order_and_measure(req.start, selected)

    stops = [
        content_service.build_stop(poi, req.theme, order=i + 1) for i, poi in enumerate(ordered)
    ]

    walk_min = (actual_km / settings.walking_speed_kmh) * 60
    duration_min = round(walk_min + len(stops) * settings.minutes_per_stop)

    sources = [f.source for s in stops for f in s.poi.facts]
    sources += [s.poi.background_source for s in stops if s.poi.background_source is not None]
    attributions = content_service.collect_attributions(sources)
    # OSM attribution is always required when its data underpins routing (PRD §10).
    osm_attr = "OpenStreetMap (ODbL)"
    if osm_attr not in attributions:
        attributions.append(osm_attr)

    return Trail(
        id=str(uuid.uuid4()),
        city=settings.default_city,
        theme=req.theme,
        requested_distance_km=req.distance_km,
        actual_distance_km=actual_km,
        estimated_duration_min=duration_min,
        start=req.start,
        stops=stops,
        attributions=sorted(attributions),
    )


def default_theme() -> Theme:
    return Theme.MIXED
